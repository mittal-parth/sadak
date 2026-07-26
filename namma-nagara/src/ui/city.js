import * as THREE from 'three';
import { setStyle } from './util.js';

/**
 * UI — the open-world city HUD.
 *
 * A shooter HUD and an open-world HUD answer different questions. The CoD
 * furniture is all about the next two seconds — where the rounds are going, how
 * many are left, who just died. An open-world HUD is about WHERE YOU ARE. So on
 * the Bengaluru level the combat widgets are switched off and replaced by the
 * one thing GTA never leaves out: a district card when you cross a boundary.
 *
 * Nothing here is destructive. The widgets are hidden, not removed — they keep
 * updating behind `display:none`, so a level that wants them back just does not
 * construct this. The market level never sees any of it.
 *
 * Per the subsystem contract, no CSS transitions: the card's timing is the
 * existing `Banner`, which integrates from `dt` in `lateUpdate`.
 */

/**
 * Districts, in LEVEL space (the same coordinates `layout.js` is authored in),
 * as [zMin, zMax, name, subtitle]. The street runs down -Z, so the player walks
 * from Shivajinagar in the north down to Vidhana Soudha at the south end.
 *
 * Ordered north to south; the first match wins.
 */
const ZONES = [
  [24, 999, 'SHIVAJINAGAR', 'commercial street'],
  [-2, 24, 'RUSSELL MARKET', 'produce & flowers'],
  [-22, -2, 'CUBBON ROAD', 'auto stand'],
  [-999, -22, 'VIDHANA SOUDHA', 'seat of government'],
];

export class CityHud {
  /**
   * @param {object} ctx    engine context
   * @param {object} ui     the UiSystem, for its widget handles
   */
  constructor(ctx, ui) {
    this.ctx = ctx;
    this.ui = ui;
    this.zone = null;
    this._t = 0;
    // Preallocated: worldToLevel writes into a THREE.Vector3, and the
    // subsystem contract forbids allocating per frame.
    this._v = new THREE.Vector3();

    // Switch off the combat furniture. `matchBar` is the TDM scoreline, which
    // is the single most out-of-place thing on a street with no enemies.
    for (const w of [ui.crosshair, ui.hit, ui.ammo, ui.killfeed, ui.matchBar]) {
      if (w?.root) setStyle(w.root, 'display', 'none');
    }
  }

  /**
   * Which district a LEVEL-space z falls in.
   * @returns {Array|null}
   */
  static zoneAt(z) {
    for (const zone of ZONES) if (z >= zone[0] && z < zone[1]) return zone;
    return null;
  }

  update(dt) {
    // Poll at 4 Hz. A district boundary is metres wide and the player moves at
    // 4.5 m/s, so testing every frame buys nothing and costs a world->level
    // transform per frame.
    this._t += dt;
    if (this._t < 0.25) return;
    this._t = 0;

    const world = this.ctx.peek('world');
    const cam = this.ctx.camera;
    if (!world?.worldToLevel || !cam) return;

    const p = world.worldToLevel(cam.position.x, cam.position.y, cam.position.z, this._v);
    const zone = CityHud.zoneAt(p.z);
    if (!zone || zone === this.zone) return;

    // Suppress the card on the very first evaluation — arriving in the world is
    // not "entering a district", and a banner on frame one reads as a bug.
    const first = this.zone === null;
    this.zone = zone;
    if (!first) this.ui.banner?.show(zone[2], zone[3], 2.6);
  }

  dispose() {
    for (const w of [
      this.ui.crosshair,
      this.ui.hit,
      this.ui.ammo,
      this.ui.killfeed,
      this.ui.matchBar,
    ]) {
      if (w?.root) setStyle(w.root, 'display', '');
    }
  }
}
