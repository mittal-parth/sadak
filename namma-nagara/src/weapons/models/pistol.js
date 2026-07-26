import { Assembly, box, blob, extrude, roundRect, latheZ, rodZ, tubeZ, dome, ring, mergeAll } from '../geometry.js';
import {
  addRail,
  addPistolGrip,
  addScrew,
  addPin,
  buildMagazine,
  buildMiniReflex,
  buildSlide,
  triggerPart,
  cartridge,
} from '../parts.js';

/**
 * The sidearm — a striker-fired polymer-framed 9 mm, slide-mounted mini reflex.
 *
 * A pistol is where proportion errors are most obvious, so the numbers are the
 * real ones: 183 mm slide, 26 mm across, bore 36 mm over the web of the hand,
 * 18-degree grip rake, 22 mm of slide travel.
 */
export function buildPistol() {
  const bore = 0.036;
  const slideH = 0.0248;
  const slideW = 0.0262;
  const slideLen = 0.183;
  const zSlideRear = 0.052;
  const zSlideFront = zSlideRear - slideLen;
  const gripAngle = 0.32;

  const body = new Assembly('pistol-frame');

  /* ---- frame ---------------------------------------------------------- */
  // Dust cover / frame rails under the slide.
  const dust = extrude(
    [
      [-slideW * 0.5 + 0.001, 0],
      [slideW * 0.5 - 0.001, 0],
      [slideW * 0.5 - 0.001, -0.0125],
      [slideW * 0.5 - 0.004, -0.016],
      [-slideW * 0.5 + 0.004, -0.016],
      [-slideW * 0.5 + 0.001, -0.0125],
    ],
    0.108,
    { bevel: 0.001 }
  );
  body.add(dust, 'polymer', { y: bore - 0.0075, z: -0.062 });
  dust.dispose();

  // Frame body around the trigger and the magwell.
  const frameCore = blob(slideW - 0.001, 0.05, 0.062, 0.004, 3);
  body.add(frameCore, 'polymer', { y: bore - 0.032, z: 0.012 });
  frameCore.dispose();

  // Beavertail / tang.
  const tang = extrude(
    [
      [-0.008, 0],
      [0.03, -0.004],
      [0.032, -0.012],
      [-0.008, -0.014],
    ],
    slideW - 0.003,
    { bevel: 0.0012 }
  );
  body.add(tang, 'polymer', { y: bore - 0.014, z: 0.034, ry: Math.PI / 2 });
  tang.dispose();

  // Accessory rail under the dust cover.
  addRail(body, 'polymer', -0.112, -0.058, bore - 0.0175, 0, {
    width: 0.0175,
    waist: 0.013,
    baseH: 0.0026,
    topH: 0.0024,
    pitch: 0.0092,
    slot: 0.0046,
  });

  // Trigger guard: undercut, with a slight index ledge.
  const guardOuter = [
    [-0.024, 0],
    [0.026, 0],
    [0.028, -0.007],
    [0.024, -0.022],
    [0.013, -0.027],
    [-0.016, -0.027],
    [-0.024, -0.021],
  ];
  const guardInner = [
    [-0.019, -0.003],
    [0.021, -0.003],
    [0.0225, -0.009],
    [0.0185, -0.0205],
    [0.01, -0.0235],
    [-0.013, -0.0235],
    [-0.019, -0.0185],
  ];
  const guard = extrude(guardOuter, slideW - 0.004, { bevel: 0.001, holes: [guardInner] });
  body.add(guard, 'polymer', { y: bore - 0.0245, z: -0.03 });
  guard.dispose();

  /* ---- grip ----------------------------------------------------------- */
  addPistolGrip(body, 'polymer', 'rubber', {
    y: bore - 0.014,
    z: 0.016,
    angle: gripAngle,
    len: 0.113,
    w: 0.0305,
  });
  // Stippling: a field of tiny raised pyramids on both side panels.
  const stipple = [];
  for (let r = 0; r < 9; r++) {
    for (let cIdx = 0; cIdx < 5; cIdx++) {
      const g = box(0.0024, 0.0024, 0.0009, 0.0003, 1);
      g.translate(-0.005 + cIdx * 0.0026 + (r % 2) * 0.0013, -0.012 - r * 0.0072, 0);
      stipple.push(g);
    }
  }
  const stippleG = mergeAll(stipple);
  for (const sx of [-1, 1]) {
    body.add(stippleG, 'polymer', {
      x: sx * 0.0152,
      y: bore - 0.016,
      z: 0.017,
      ry: sx * Math.PI * 0.5,
      rx: 0,
      rz: sx > 0 ? -gripAngle : gripAngle,
    });
  }
  stippleG.dispose();

  // Magazine release, slide stop lever, takedown lever.
  const relButton = latheZ(
    [
      [0, 0],
      [0, 0.0042],
      [0.0015, 0.0048],
      [0.0038, 0.0048],
      [0.0038, 0],
    ],
    12
  );
  body.add(relButton, 'polymer', { x: 0.0138, y: bore - 0.032, z: -0.014, ry: Math.PI / 2 });
  relButton.dispose();
  const stopLever = extrude(
    [
      [-0.014, -0.0028],
      [0.012, -0.0035],
      [0.014, 0.0028],
      [-0.014, 0.0035],
    ],
    0.0032,
    { bevel: 0.0005 }
  );
  body.add(stopLever, 'steel', { x: -0.0132, y: bore - 0.0135, z: -0.022, ry: Math.PI / 2 });
  body.add(stopLever, 'steel', { x: 0.0132, y: bore - 0.0135, z: -0.022, ry: Math.PI / 2 });
  stopLever.dispose();
  const takedown = latheZ(
    [
      [0, 0],
      [0, 0.0035],
      [0.0022, 0.004],
      [0.0022, 0],
    ],
    12
  );
  body.add(takedown, 'steel', { x: -0.0138, y: bore - 0.0175, z: -0.046, ry: -Math.PI / 2 });
  takedown.dispose();

  /* ---- barrel, exposed at the muzzle, plus the recoil spring ---------- */
  const barrel = latheZ(
    [
      [0, 0],
      [0, 0.0082],
      [0.0016, 0.0088],
      [0.006, 0.0088],
      [0.0072, 0.0078],
      [0.0072, 0.0048],
    ],
    18
  );
  body.add(barrel, 'steel_bright', { y: bore, z: zSlideFront + 0.0012, ry: Math.PI });
  barrel.dispose();
  const boreHole = tubeZ(0.0048, 0.0034, 0.03, 12, 0.0002);
  body.add(boreHole, 'cavity', { y: bore, z: zSlideFront + 0.012 });
  boreHole.dispose();
  const spring = latheZ(
    [
      [0, 0.0032],
      [0, 0.0048],
      [0.004, 0.0048],
      [0.004, 0.0032],
    ],
    12
  );
  body.add(spring, 'steel_bright', { y: bore - 0.0125, z: zSlideFront + 0.0025 });
  spring.dispose();

  /* ---- moving parts --------------------------------------------------- */
  const slideAsm = new Assembly('pistol-slide');
  const slide = buildSlide(slideAsm, {
    w: slideW,
    h: slideH,
    len: slideLen,
    // Nitrided, not bare steel: a slide is one big flat facing the sky.
    mat: 'steel_black',
    zRear: zSlideRear,
  });
  // Slide-mounted mini reflex, in a milled pocket behind the rear sight.
  const reflex = buildMiniReflex(slideAsm, {
    w: 0.0246,
    h: 0.021,
    len: 0.0455,
    y: slideH * 0.5 + 0.0018,
    z: zSlideRear - 0.038,
    matBody: 'alu_fine',
  });
  const opticY = bore + slideH * 0.5 + 0.0018 + 0.021 * 0.56;
  const opticZ = zSlideRear - 0.038 + 0.0455 * 0.14;

  const magazine = new Assembly('pistol-mag');
  const mag = buildMagazine(magazine, null, {
    w: 0.0212,
    d: 0.0295,
    len: 0.108,
    curve: 0.004,
    segs: 5,
    witness: 3,
    caseLen: 0.0192,
    rimR: 0.00478,
    bulletLen: 0.0132,
    poly: 'polymer',
  });

  const trigger = new Assembly('pistol-trigger');
  const trg = triggerPart('polymer');
  trigger.add(trg.geo, 'polymer', {});
  trg.geo.dispose();
  // The trigger safety blade down the middle of the face.
  const blade = extrude(
    [
      [-0.0022, 0.003],
      [0.0022, 0.003],
      [0.0022, -0.016],
      [-0.0022, -0.017],
    ],
    0.0028,
    { bevel: 0.0004 }
  );
  trigger.add(blade, 'steel', { x: 0, y: -0.001, z: 0.0022 });
  blade.dispose();

  return {
    id: 'pistol',
    label: 'P-19',
    fxClass: 'pistol',
    body,
    moving: { magazine, trigger, slide: slideAsm },
    nodes: {
      muzzle: [0, bore, zSlideFront - 0.004],
      chamber: [0, bore, zSlideRear - 0.05],
      eject: [slideW * 0.5 + 0.004, bore + 0.005, zSlideRear - 0.05],
      ejectDir: [0.82, 0.52, 0.24],
      sight: [0, opticY, opticZ],
      sightAxis: [0, 0, -1],
      ironSight: [0, bore + slideH * 0.5 + 0.0065, zSlideRear - 0.012],
      // Wrist targets (see models/rifle.js for the derivation).
      gripR: {
        pos: [0.028, 0.003, 0.07],
        finger: [0, -0.315, -0.949],
        back: [0.98, 0, -0.2],
      },
      /** Support hand cups the firing hand rather than the frame. */
      gripL: {
        pos: [-0.03, -0.012, 0.076],
        finger: [0.34, -0.28, -0.9],
        back: [0.15, 0.93, -0.33],
      },
      magSeat: { pos: [0, bore - 0.03, 0.019], rot: [-gripAngle, 0, 0] },
      magDrop: [0, -0.42, 0.05],
      slideRest: { pos: [0, bore, 0], rot: [0, 0, 0] },
      slideTravel: [0, 0, 0.0225],
      triggerPivot: { pos: [0, bore - 0.0135, -0.0165], rot: [0, 0, 0] },
      triggerPull: -0.3,
      opticGlass: reflex,
      slideGeom: slide,
    },
    shell: { caseLen: 0.0192, rimR: 0.00478 },
    magSize: { len: mag.len, w: mag.w, d: mag.d },
  };
}
