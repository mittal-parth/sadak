import * as THREE from "three";
import {
  bakedBox,
  bakedCyl,
  bakedSphere,
  bakedTorus,
  mergeByMaterial,
  stdMat,
  type AssetMaterialLib,
  type Part,
} from "./shared";

/**
 * A tall Indian tricolour on a flagpole, sized to read as a landmark from
 * street level. Each colour band is a continuous solid ribbon walked along
 * a single soft bend, so the cloth curves away from the mast without the
 * seams a row of separately-angled boxes would leave. The white band
 * carries an Ashoka Chakra — navy rim, hub and 24 spokes — laid flush on
 * both faces at the cloth's centre.
 */
export function makeIndianFlag(materials?: AssetMaterialLib): THREE.Group {
  const parts: Part[] = [];

  const stone = stdMat(0x9a9a9a, { roughness: 0.9 }, materials);
  const poleMat = stdMat(0xd9d9d9, { roughness: 0.35, metalness: 0.6 }, materials);
  const goldMat = stdMat(
    0xd4af37,
    { roughness: 0.3, metalness: 0.7, emissive: 0x2a1d05, emissiveIntensity: 0.3 },
    materials
  );
  const saffron = stdMat(0xff9933, { roughness: 0.75 }, materials);
  const white = stdMat(0xfaf9f6, { roughness: 0.75 }, materials);
  const green = stdMat(0x138808, { roughness: 0.75 }, materials);
  const navy = stdMat(0x0b1f66, { roughness: 0.5 }, materials);

  // Plinth: octagonal-ish base + square plate the pole sits on.
  parts.push({ geo: bakedCyl(0.55, 0.62, 0.25, 10, 0, 0.125, 0), mat: stone });
  parts.push({ geo: bakedBox(1.15, 0.16, 1.15, 0, 0.33, 0), mat: stone });

  const baseY = 0.41;
  const poleH = 11.4;
  const poleTopY = baseY + poleH;

  // Tapered pole with a decorative collar near the base.
  parts.push({ geo: bakedCyl(0.06, 0.1, poleH, 8, 0, baseY + poleH / 2, 0), mat: poleMat });
  parts.push({ geo: bakedTorus(0.11, 0.02, 0, baseY + 0.5, 0, Math.PI / 2), mat: goldMat });
  parts.push({ geo: bakedSphere(0.11, 0, poleTopY + 0.12, 0), mat: goldMat });

  // Cloth: mounted just below the finial and flying off in +X.
  const bandH = 0.62;
  const clothTopY = poleTopY - 0.35;
  const clothW = 2.46;
  const clothHalfT = 0.015;
  // The pole tapers to ~0.06 radius up here, so a hoist edge at the old 0.1
  // stopped short of the mast and left a visible slot between the two. Start
  // the cloth inside the cylinder instead — the edge is then never on screen.
  const poleX = 0.02;
  const SAMPLES = 18;

  // One soft bend across the whole cloth, not a ripple: less than a full
  // sine period, amplitude ramped in from zero at the pole so the hoist
  // edge stays flat and the fly end does the drifting.
  const waveAt = (t: number) => Math.sin(t * Math.PI * 0.8) * 0.2 * t;
  const clothX = (t: number) => poleX + clothW * t;

  /** Cloth centreline and its outward (±Z-ish) normal at parameter t. */
  function clothFrame(t: number) {
    const d = 1e-3;
    const t0 = Math.max(0, t - d);
    const t1 = Math.min(1, t + d);
    const tx = clothX(t1) - clothX(t0);
    const tz = waveAt(t1) - waveAt(t0);
    const len = Math.hypot(tx, tz) || 1;
    return {
      x: clothX(t),
      z: waveAt(t),
      nx: -tz / len,
      nz: tx / len,
      // Yaw that turns a +Z-facing flat shape onto the cloth here. rotateY(a)
      // sends +Z to (sin a, 0, cos a) while the normal above is
      // (-sin, 0, cos), so this is the negated tangent angle, not the tangent
      // angle itself — using the latter tilts by double and buries one edge.
      faceYaw: -Math.atan2(tz, tx),
    };
  }

  /**
   * One colour band, built as a continuous solid ribbon that follows the
   * bend. The cloth used to be a row of separately-yawed boxes, which left a
   * V-shaped gap at every joint once the flag was viewed off-axis; walking
   * one vertex strip along the curve closes them. Quads carry their own
   * vertices so shading stays flat, matching the rest of the kit.
   */
  function band(yTop: number, yBottom: number, capTop: boolean, capBottom: boolean) {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];

    const quad = (...corners: Array<[number, number, number]>) => {
      const b = pos.length / 3;
      corners.forEach(([x, y, z]) => pos.push(x, y, z));
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };

    const rings = Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const f = clothFrame(i / SAMPLES);
      const ox = f.nx * clothHalfT;
      const oz = f.nz * clothHalfT;
      return {
        fTop: [f.x + ox, yTop, f.z + oz] as [number, number, number],
        fBot: [f.x + ox, yBottom, f.z + oz] as [number, number, number],
        bTop: [f.x - ox, yTop, f.z - oz] as [number, number, number],
        bBot: [f.x - ox, yBottom, f.z - oz] as [number, number, number],
      };
    });

    for (let i = 0; i < SAMPLES; i++) {
      const a = rings[i];
      const b = rings[i + 1];
      quad(a.fTop, a.fBot, b.fBot, b.fTop);
      quad(a.bTop, b.bTop, b.bBot, a.bBot);
      // Interior edges between bands are left open — the neighbouring band
      // already closes the surface there.
      if (capTop) quad(a.bTop, a.fTop, b.fTop, b.bTop);
      if (capBottom) quad(a.fBot, a.bBot, b.bBot, b.fBot);
    }

    const first = rings[0];
    const last = rings[SAMPLES];
    quad(first.bTop, first.bBot, first.fBot, first.fTop);
    quad(last.fTop, last.fBot, last.bBot, last.bTop);

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Fastenings clamping the hoist to the mast, at the cloth's top and bottom
  // corners where a real flag's clips sit.
  [clothTopY - 0.05, clothTopY - bandH * 3 + 0.05].forEach((y) => {
    parts.push({ geo: bakedTorus(0.075, 0.022, 0, y, 0, Math.PI / 2), mat: goldMat });
  });

  [saffron, white, green].forEach((mat, i) => {
    const yTop = clothTopY - bandH * i;
    parts.push({ geo: band(yTop, yTop - bandH, i === 0, i === 2), mat });
  });

  // Ashoka Chakra, centred in the white band across the cloth's full width
  // as on the real flag, and yawed to match the cloth so it stays flush
  // against the bend. Drawn on both faces so it reads from either side.
  // Diameter is three quarters of the band height.
  const mid = clothFrame(0.5);
  const chakraX = mid.x;
  const chakraY = clothTopY - bandH * 1.5;
  const chakraZ = mid.z;
  const chakraYaw = mid.faceYaw;
  const chakraR = bandH * 0.375;
  const rimTube = 0.018;

  /** Rotate a chakra piece built around the origin onto the cloth. */
  const ontoCloth = (geo: THREE.BufferGeometry) => {
    geo.rotateY(chakraYaw);
    geo.translate(chakraX, chakraY, chakraZ);
    return geo;
  };

  // Sit the emblem just proud of the cloth face rather than through it.
  const chakraLift = clothHalfT + rimTube * 0.5;
  [chakraLift, -chakraLift].forEach((zOff) => {
    const rim = new THREE.TorusGeometry(chakraR, rimTube, 6, 20);
    rim.translate(0, 0, zOff);
    parts.push({ geo: ontoCloth(rim), mat: navy });

    const hub = new THREE.SphereGeometry(0.035, 8, 6);
    hub.translate(0, 0, zOff);
    parts.push({ geo: ontoCloth(hub), mat: navy });

    // 12 bars spanning the rim read as the chakra's 24 spokes.
    const barLen = (chakraR - rimTube) * 2;
    for (let s = 0; s < 12; s++) {
      const bar = new THREE.BoxGeometry(0.014, barLen, 0.012);
      bar.rotateZ((s / 12) * Math.PI);
      bar.translate(0, 0, zOff);
      parts.push({ geo: ontoCloth(bar), mat: navy });
    }
  });

  return mergeByMaterial(parts);
}
