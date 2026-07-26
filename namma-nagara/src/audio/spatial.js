/**
 * AUDIO / SPATIALISATION
 *
 * A pool of reusable 3D emitter chains. Each chain is:
 *
 *   input ─► occlusionLP ─► airLP ─► distanceGain ─┬─► panner (HRTF) ─► bus
 *                                                  └─► sendGain ─► reverb send
 *
 * Notes on the design decisions, because they are not the obvious ones:
 *
 *  - The PannerNode's own distance model is switched OFF (rolloffFactor 0) and
 *    attenuation is applied by `distanceGain` instead. That is what lets the
 *    reverb send be *post* distance attenuation but *pre* panning, which is how
 *    a far source correctly ends up wetter than a near one.
 *  - `airLP` is air absorption, `occlusionLP` is geometry. They are separate so
 *    a distant *and* occluded source stacks both losses, as it should.
 *  - The whole chain is built once and only the panner→bus edge is connected
 *    while the emitter is in use; a free emitter is detached from the graph so
 *    the (expensive) HRTF convolution is not evaluated for silence.
 *  - Propagation delay is not a DelayNode: every voice is *scheduled* at
 *    `now + dist/343`, which is sample-accurate and free.
 */

import { airCutoff, clamp, gain, biquad } from './dsp.js';

const MAX_EMITTERS = 40;

/** Reference distance for the attenuation curve, in metres. */
const REF = 2.0;

class Emitter {
  constructor(actx, mixer) {
    this.actx = actx;
    this.mixer = mixer;
    this.input = gain(actx, 1);
    this.occLP = biquad(actx, 'lowpass', 20000, 0.4);
    this.occHS = biquad(actx, 'highshelf', 2200, 0.7, 0);
    this.airLP = biquad(actx, 'lowpass', 20000, 0.5);
    this.distGain = gain(actx, 1);
    this.sendGain = gain(actx, 0);

    const p = actx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1;
    p.rolloffFactor = 0; // attenuation handled by distGain
    p.maxDistance = 10000;
    p.coneInnerAngle = 360;
    this.panner = p;

    this.input.connect(this.occLP);
    this.occLP.connect(this.occHS);
    this.occHS.connect(this.airLP);
    this.airLP.connect(this.distGain);
    this.distGain.connect(this.panner);
    this.distGain.connect(this.sendGain);

    this.free = true;
    this.endTime = 0;
    this.priority = 0;
    this.busName = 'foley';
    this.attached = null;
    this.tracked = false;
    this.pos = { x: 0, y: 0, z: 0 };
    this._connected = false;
    this._sendConnected = false;
  }

  _setPos(x, y, z, when) {
    const p = this.panner;
    if (p.positionX) {
      p.positionX.setValueAtTime(x, when);
      p.positionY.setValueAtTime(y, when);
      p.positionZ.setValueAtTime(z, when);
    } else {
      p.setPosition(x, y, z);
    }
    this.pos.x = x; this.pos.y = y; this.pos.z = z;
  }

  /** Smoothly move a long-lived emitter (ambience beds, voices, loops). */
  moveTo(x, y, z, smooth = 0.06) {
    const p = this.panner;
    const t = this.actx.currentTime;
    if (p.positionX) {
      p.positionX.setTargetAtTime(x, t, smooth);
      p.positionY.setTargetAtTime(y, t, smooth);
      p.positionZ.setTargetAtTime(z, t, smooth);
    } else {
      p.setPosition(x, y, z);
    }
    this.pos.x = x; this.pos.y = y; this.pos.z = z;
  }

  connectOut(busNode, sendNode) {
    if (!this._connected) {
      this.panner.connect(busNode);
      this._connected = busNode;
    }
    if (!this._sendConnected && sendNode) {
      this.sendGain.connect(sendNode);
      this._sendConnected = sendNode;
    }
  }

  detach() {
    if (this._connected) {
      try { this.panner.disconnect(this._connected); } catch { /* noop */ }
      this._connected = false;
    }
    if (this._sendConnected) {
      try { this.sendGain.disconnect(this._sendConnected); } catch { /* noop */ }
      this._sendConnected = false;
    }
    if (this.attached) {
      try { this.attached.disconnect(); } catch { /* noop */ }
      this.attached = null;
    }
    this.tracked = false;
    this.free = true;
  }

  dispose() {
    this.detach();
    this.input.disconnect();
    this.occLP.disconnect();
    this.occHS.disconnect();
    this.airLP.disconnect();
    this.distGain.disconnect();
    this.sendGain.disconnect();
    this.panner.disconnect();
  }
}

export class SpatialField {
  /**
   * @param {BaseAudioContext} actx
   * @param {import('./mixer.js').Mixer} mixer
   * @param {object} ctx engine context (for physics raycasts); may be null
   */
  constructor(actx, mixer, ctx) {
    this.actx = actx;
    this.mixer = mixer;
    this.ctx = ctx;
    this.emitters = [];
    for (let i = 0; i < MAX_EMITTERS; i++) this.emitters.push(new Emitter(actx, mixer));

    // Preallocated scratch — update() must never allocate.
    this._lp = { x: 0, y: 1.6, z: 0 };
    this._occOrigin = { x: 0, y: 0, z: 0 };
    this._occDir = { x: 0, y: 0, z: 0 };
    this._trackCursor = 0;
    this.stats = { active: 0, stolen: 0, dropped: 0, occlusionRays: 0 };
    this.occlusionEnabled = true;
  }

  /** Feed the AudioListener from the render camera. Called once per frame. */
  setListener(px, py, pz, fx, fy, fz, ux, uy, uz) {
    const l = this.actx.listener;
    const t = this.actx.currentTime;
    this._lp.x = px; this._lp.y = py; this._lp.z = pz;
    if (l.positionX) {
      // setTargetAtTime rather than a hard set: the doppler-free smoothing kills
      // the zipper noise you otherwise get from a 60 Hz position update.
      l.positionX.setTargetAtTime(px, t, 0.02);
      l.positionY.setTargetAtTime(py, t, 0.02);
      l.positionZ.setTargetAtTime(pz, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02);
      l.forwardY.setTargetAtTime(fy, t, 0.02);
      l.forwardZ.setTargetAtTime(fz, t, 0.02);
      l.upX.setTargetAtTime(ux, t, 0.05);
      l.upY.setTargetAtTime(uy, t, 0.05);
      l.upZ.setTargetAtTime(uz, t, 0.05);
    } else {
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  get listenerPos() {
    return this._lp;
  }

  distanceTo(x, y, z) {
    const l = this._lp;
    return Math.hypot(x - l.x, y - l.y, z - l.z);
  }

  /**
   * Attenuation curve. Deliberately gentler than 1/r beyond ~40 m: real
   * gunfire at 150 m is still clearly audible, and pure inverse-distance makes
   * a level feel dead. Below 40 m it is very close to physical.
   */
  attenuation(dist) {
    const near = REF / (REF + 0.85 * Math.max(0, dist - REF));
    const far = 0.055 * Math.pow(60 / Math.max(dist, 60), 0.55);
    return clamp(Math.max(near, dist > 45 ? far : 0), 0.0, 1);
  }

  /**
   * Occlusion test: how much geometry is between the listener and a point.
   * Returns 0 (clear) .. 1 (thick wall). Two rays — ear height and a raised
   * one — so a low crate does not fully mute a source behind it.
   */
  occlusionAt(x, y, z) {
    if (!this.occlusionEnabled) return 0;
    const phys = this.ctx?.peek?.('physics');
    if (!phys?.raycast) return 0;
    const l = this._lp;
    const dx = x - l.x, dy = y - l.y, dz = z - l.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.8) return 0;
    const mask = phys.MASK?.SIGHT ?? undefined;
    let blocked = 0;
    const o = this._occOrigin, dir = this._occDir;
    for (let i = 0; i < 2; i++) {
      const lift = i === 0 ? 0 : 0.55;
      o.x = l.x; o.y = l.y + lift; o.z = l.z;
      dir.x = x - o.x; dir.y = y + lift * 0.5 - o.y; dir.z = z - o.z;
      const len = Math.hypot(dir.x, dir.y, dir.z);
      if (len < 1e-4) continue;
      this.stats.occlusionRays++;
      const hit = phys.raycast(o, dir, len - 0.25, mask);
      if (hit?.hit) {
        // A thin partition muffles less than a bunker wall: use how far past the
        // first hit the ray continued as a crude thickness proxy.
        blocked += hit.distance < len * 0.9 ? 1 : 0.5;
      }
    }
    return clamp(blocked / 2, 0, 1);
  }

  /**
   * Grab an emitter. Returns null when the budget is full and the new sound is
   * less important than everything already playing.
   *
   * opts: { x,y,z, bus, send, priority, endTime, occlusion, dist, atten }
   */
  acquire(opts) {
    const now = this.actx.currentTime;
    let em = null;
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      if (e.free) { em = e; break; }
    }
    if (!em) {
      // Steal the least important voice that is closest to finishing.
      let worst = null, worstScore = Infinity;
      const pri = opts.priority ?? 0.5;
      for (let i = 0; i < this.emitters.length; i++) {
        const e = this.emitters[i];
        if (e.tracked) continue; // never steal a bed/loop
        const score = e.priority * 4 + Math.max(0, e.endTime - now);
        if (score < worstScore) { worstScore = score; worst = e; }
      }
      if (!worst || worst.priority > pri + 0.25) {
        this.stats.dropped++;
        return null;
      }
      worst.detach();
      this.stats.stolen++;
      em = worst;
    }

    const t = opts.when ?? now;
    const dist = opts.dist ?? this.distanceTo(opts.x, opts.y, opts.z);
    const occ = opts.occlusion !== undefined ? opts.occlusion : this.occlusionAt(opts.x, opts.y, opts.z);
    const atten = (opts.atten ?? this.attenuation(dist)) * (1 - 0.62 * occ);

    em.free = false;
    em.priority = opts.priority ?? 0.5;
    em.endTime = opts.endTime ?? now + 1;
    em.busName = opts.bus ?? 'foley';
    em.tracked = !!opts.tracked;
    em.userGain = opts.gain ?? 1;
    em._setPos(opts.x, opts.y, opts.z, t);

    // Air absorption + occlusion filtering.
    em.airLP.frequency.setValueAtTime(airCutoff(dist), t);
    const occCut = 20000 * Math.pow(0.021, occ); // 1.0 -> ~420 Hz
    em.occLP.frequency.setValueAtTime(clamp(occCut, 300, 20000), t);
    em.occHS.gain.setValueAtTime(-26 * occ, t);
    em.distGain.gain.setValueAtTime(clamp(atten * (opts.gain ?? 1), 0, 4), t);

    // Farther and more occluded => proportionally wetter.
    const send = (opts.send ?? 0.25) * (0.5 + Math.min(dist, 90) * 0.022) * (1 + occ * 0.7);
    em.sendGain.gain.setValueAtTime(clamp(send, 0, 3), t);

    em.connectOut(this.mixer.bus(em.busName), this.mixer.reverbSend);
    return em;
  }

  /** Update an in-flight tracked emitter's occlusion/distance (beds, voices). */
  refresh(em) {
    if (em.free) return;
    const t = this.actx.currentTime;
    const p = em.pos;
    const dist = this.distanceTo(p.x, p.y, p.z);
    const occ = this.occlusionAt(p.x, p.y, p.z);
    const atten = this.attenuation(dist) * (1 - 0.62 * occ);
    em.airLP.frequency.setTargetAtTime(airCutoff(dist), t, 0.12);
    em.occLP.frequency.setTargetAtTime(clamp(20000 * Math.pow(0.021, occ), 300, 20000), t, 0.12);
    em.occHS.gain.setTargetAtTime(-26 * occ, t, 0.12);
    em.distGain.gain.setTargetAtTime(clamp(atten * (em.userGain ?? 1), 0, 4), t, 0.1);
  }

  /** Hand a voice's top node to an emitter and set its teardown time. */
  hold(em, node, endTime) {
    node.connect(em.input);
    em.attached = node;
    em.endTime = endTime;
  }

  update(dt) {
    const now = this.actx.currentTime;
    let active = 0;
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      if (e.free) continue;
      if (!e.tracked && now > e.endTime) {
        e.detach();
        continue;
      }
      active++;
    }
    this.stats.active = active;

    // Re-evaluate one tracked emitter per frame: 40 emitters at 60 fps is a
    // 1.5 Hz refresh worst case, which is plenty for beds and walking NPCs and
    // costs at most two raycasts a frame.
    if (this.emitters.length) {
      for (let n = 0; n < this.emitters.length; n++) {
        this._trackCursor = (this._trackCursor + 1) % this.emitters.length;
        const e = this.emitters[this._trackCursor];
        if (!e.free && e.tracked) {
          this.refresh(e);
          break;
        }
      }
    }
  }

  dispose() {
    for (const e of this.emitters) e.dispose();
    this.emitters.length = 0;
  }
}
