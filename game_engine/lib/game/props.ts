import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/** Deterministic PRNG so the city looks identical on every reload. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const flat = (color: number, opts: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, ...opts });

/** Physically-lit prop material. Anything the player walks right up to gets
 *  this rather than `flat`, so it responds to the sun the way the buildings
 *  and vehicles around it do. */
const std = (color: number, roughness = 0.7, metalness = 0.1) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Self-lit lamp lens. `intensity` is what the bloom pass keys off. */
const glow = (color: number, intensity = 1) =>
  new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.25,
  });

/* ------------------------------------------------------------------ *
 * Facade textures
 * ------------------------------------------------------------------ */

const facadeCache = new Map<string, THREE.CanvasTexture>();

/**
 * Paints a building facade onto a canvas: washed plaster, rows of windows,
 * balconies, and the odd air-conditioner. Cached per colour/size combination
 * so we upload a handful of textures rather than one per building.
 */
export function facadeTexture(base: number, floors: number, seed: number): THREE.CanvasTexture {
  const cacheKey = `${base}-${floors}-${seed % 4}`;
  const hit = facadeCache.get(cacheKey);
  if (hit) return hit;

  const rand = mulberry32(seed);
  const cols = 4;
  const cell = 64;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = floors * cell;
  const ctx = canvas.getContext("2d")!;

  const c = new THREE.Color(base);
  ctx.fillStyle = `#${c.getHexString()}`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grime: darker wash towards the bottom of the building.
  const grime = ctx.createLinearGradient(0, canvas.height, 0, 0);
  grime.addColorStop(0, "rgba(40,30,20,0.45)");
  grime.addColorStop(0.35, "rgba(40,30,20,0.10)");
  grime.addColorStop(1, "rgba(255,255,255,0.06)");
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let f = 0; f < floors; f++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cell;
      const y = f * cell;

      // Ground floor is shopfront, not housing.
      if (f === floors - 1) {
        ctx.fillStyle = rand() > 0.5 ? "#2b2118" : "#3a2a1c";
        ctx.fillRect(x + 6, y + 20, cell - 12, cell - 24);
        ctx.fillStyle = ["#e67e22", "#c0392b", "#16a085", "#8e44ad"][
          Math.floor(rand() * 4)
        ];
        ctx.fillRect(x + 4, y + 10, cell - 8, 12); // shop awning / signboard
        continue;
      }

      const lit = rand() > 0.55;
      ctx.fillStyle = lit ? "#ffd98a" : "#2e3d4d";
      ctx.fillRect(x + 12, y + 14, cell - 24, cell - 32);

      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 12, y + 14, cell - 24, cell - 32);

      // Balcony railing.
      if (rand() > 0.6) {
        ctx.fillStyle = "rgba(20,20,20,0.55)";
        ctx.fillRect(x + 8, y + cell - 24, cell - 16, 8);
      }
      // Air conditioner box.
      if (rand() > 0.85) {
        ctx.fillStyle = "#9aa5ad";
        ctx.fillRect(x + cell - 22, y + cell - 30, 14, 10);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  facadeCache.set(cacheKey, tex);
  return tex;
}

/* ------------------------------------------------------------------ *
 * Buildings
 * ------------------------------------------------------------------ */

export function makeBuilding(
  w: number,
  d: number,
  floors: number,
  seed: number,
  palette: number[]
): THREE.Group {
  const g = new THREE.Group();
  const rand = mulberry32(seed);
  const colour = palette[Math.floor(rand() * palette.length)];
  const h = floors * 3;

  const tex = facadeTexture(colour, floors, seed);
  const sideTex = tex.clone();
  sideTex.needsUpdate = true;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ map: tex })
  );
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Parapet lip on the roof.
  const parapet = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.3, 0.5, d + 0.3),
    flat(0xb0a48d)
  );
  parapet.position.y = h + 0.25;
  g.add(parapet);

  // Rooftop water tank: the most Indian roofline detail there is.
  if (rand() > 0.35) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 1.1, 10),
      flat(0x1a1a1a)
    );
    tank.position.set((rand() - 0.5) * (w - 2), h + 1.05, (rand() - 0.5) * (d - 2));
    g.add(tank);
  }

  // Dish antenna.
  if (rand() > 0.6) {
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      flat(0xdddddd)
    );
    dish.rotation.x = -Math.PI / 3;
    dish.position.set((rand() - 0.5) * (w - 2), h + 0.8, (rand() - 0.5) * (d - 2));
    g.add(dish);
  }

  return g;
}

/* ------------------------------------------------------------------ *
 * Auto rickshaw
 * ------------------------------------------------------------------ */

/**
 * Three wheels, a curved shell and a canvas roof. The shape that matters is the
 * *taper*: an auto is wide and heavy at the rear axle and narrows to a single
 * front wheel under a rounded cowl, and the roof sits proud of the body on
 * visible posts with open sides between them. A plain box misses all three.
 */
export function makeAuto(canopyColour = 0xf5c518): THREE.Group {
  const g = new THREE.Group();

  const skirt = std(0x14161b, 0.55, 0.25);
  const shell = std(canopyColour, 0.42, 0.2);
  const canvasRoof = std(0x1c1e22, 0.9, 0);
  const chrome = std(0xc2c6ca, 0.22, 0.9);

  // Lower body, tapering in toward the single front wheel.
  const lower = new THREE.Mesh(new RoundedBoxGeometry(1.42, 0.72, 2.3, 3, 0.16), skirt);
  lower.position.set(0, 0.62, -0.1);
  lower.castShadow = true;
  g.add(lower);

  // Yellow shell over the passenger bay.
  const bay = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.86, 1.62, 3, 0.18), shell);
  bay.position.set(0, 1.42, -0.32);
  bay.castShadow = true;
  g.add(bay);

  // Rounded front cowl, squashed into a nose rather than left a sphere.
  const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.66, 16, 12), shell);
  cowl.scale.set(0.94, 1.0, 1.05);
  cowl.position.set(0, 1.16, 0.86);
  cowl.castShadow = true;
  g.add(cowl);

  // Canvas roof on four posts, with the sides left open.
  const roof = new THREE.Mesh(new RoundedBoxGeometry(1.56, 0.1, 1.94, 2, 0.05), canvasRoof);
  roof.position.set(0, 1.98, -0.24);
  roof.castShadow = true;
  g.add(roof);

  const postGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.62, 6);
  for (const [px, pz] of [[-0.72, 0.5], [0.72, 0.5], [-0.72, -1.14], [0.72, -1.14]]) {
    const post = new THREE.Mesh(postGeo, chrome);
    post.position.set(px, 1.66, pz);
    g.add(post);
  }

  // Mudguard over each rear wheel: the detail that stops the body looking
  // like it is floating over the axle.
  const guardGeo = new THREE.TorusGeometry(0.4, 0.055, 6, 12, Math.PI);
  for (const sx of [-1, 1]) {
    const guard = new THREE.Mesh(guardGeo, shell);
    guard.rotation.y = Math.PI / 2;
    guard.position.set(sx * 0.74, 0.36, -0.9);
    g.add(guard);
  }

  // Windscreen, raked back over the cowl.
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.24, 0.62, 0.05),
    new THREE.MeshPhysicalMaterial({
      color: 0x9fc6d4,
      transparent: true,
      opacity: 0.42,
      roughness: 0.08,
      metalness: 0.1,
    })
  );
  glass.rotation.x = -0.24;
  glass.position.set(0, 1.58, 0.53);
  g.add(glass);

  // Handlebar and the driver's bench, visible through the open sides.
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 6), chrome);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.16, 0.42);
  g.add(bar);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.5), std(0x2a2622, 0.9));
  bench.position.set(0, 1.02, -0.66);
  g.add(bench);

  // Headlight in a chrome ring, and the rear number plate.
  const lampRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 14), chrome);
  lampRing.position.set(0, 1.14, 1.44);
  g.add(lampRing);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), glow(0xfff3c4, 1.3));
  lamp.position.set(0, 1.14, 1.44);
  g.add(lamp);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.13, 0.03), std(0xe4e2d6, 0.9));
  plate.position.set(0, 0.72, -1.27);
  g.add(plate);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.04), glow(0xff2a18, 0.8));
  tail.position.set(0.5, 0.95, -1.26);
  g.add(tail);

  const tyre = std(0x0d0e10, 0.96, 0);
  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.2, 14);
  const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.23, 10);
  const wheels: THREE.Object3D[] = [];
  const wheelAt = (x: number, z: number) => {
    const w = new THREE.Group();
    const t = new THREE.Mesh(wheelGeo, tyre);
    t.rotation.z = Math.PI / 2;
    t.castShadow = true;
    w.add(t);
    const h = new THREE.Mesh(hubGeo, chrome);
    h.rotation.z = Math.PI / 2;
    w.add(h);
    w.position.set(x, 0.33, z);
    g.add(w);
    wheels.push(w);
  };
  // Three wheels: one at the front, two at the back.
  wheelAt(0, 1.05);
  wheelAt(-0.76, -0.9);
  wheelAt(0.76, -0.9);

  g.userData.wheels = wheels;
  g.userData.wheelRadius = 0.33;
  g.userData.halfLength = 1.35;
  g.userData.kind = "auto";

  return g;
}

/* ------------------------------------------------------------------ *
 * Street furniture
 * ------------------------------------------------------------------ */

/** A tarpaulin-roofed street stall, chai, flowers, fruit. */
export function makeStall(canopyColour: number): THREE.Group {
  const g = new THREE.Group();
  const wood = flat(0x7a5230);

  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 1.4), wood);
  counter.position.y = 0.5;
  counter.castShadow = true;
  g.add(counter);

  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6);
  [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]].forEach(([x, z]) => {
    const p = new THREE.Mesh(postGeo, flat(0x4a3a2a));
    p.position.set(x, 1.2, z);
    g.add(p);
  });

  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 0.1, 1.9),
    flat(canopyColour, { side: THREE.DoubleSide })
  );
  canopy.position.y = 2.45;
  canopy.rotation.x = 0.06;
  canopy.castShadow = true;
  g.add(canopy);

  const steel = std(0xc9ccd0, 0.3, 0.8);
  const food = flat(0xd4a017);
  const sack = flat(0xc4a574);

  // Chai kettle and tumblers — reads as a food stall from a distance.
  const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.22, 8), steel);
  kettle.position.set(0.5, 1.12, 0.2);
  g.add(kettle);
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.14, 8), steel);
    t.position.set(-0.3 + i * 0.12, 1.08, 0.35);
    g.add(t);
  }

  // Stacked paper plates and a snack tray.
  for (let i = 0; i < 3; i++) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.025, 10), flat(0xf5f0e6));
    plate.position.set(-0.75, 1.03 + i * 0.03, -0.15);
    g.add(plate);
  }
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 10), food);
  tray.position.set(0.85, 1.06, -0.2);
  g.add(tray);

  // Jars and a flour sack at the back of the counter.
  const jarGeo = new THREE.CylinderGeometry(0.1, 0.11, 0.28, 8);
  for (const [x, col] of [
    [-1.0, 0xe74c3c],
    [-0.82, 0xf39c12],
    [1.05, 0x5d4037],
  ] as const) {
    const jar = new THREE.Mesh(jarGeo, flat(col));
    jar.position.set(x, 1.14, -0.35);
    g.add(jar);
  }
  const sackMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.28), sack);
  sackMesh.position.set(1.15, 1.2, 0.35);
  g.add(sackMesh);

  return g;
}

/**
 * Tall tapered mast with a curved gooseneck arm, reaching out over the
 * carriageway. The curve is the whole silhouette: a straight arm at right
 * angles reads as scaffolding, the sweep reads as a street light.
 */
export function makeStreetLight(): THREE.Group {
  const g = new THREE.Group();
  const steel = std(0x565b62, 0.55, 0.7);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.19, 8, 10), steel);
  pole.position.y = 4;
  pole.castShadow = true;
  g.add(pole);

  // Base flange, so it meets the pavement instead of piercing it.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.36, 10), steel);
  base.position.y = 0.18;
  g.add(base);

  // Gooseneck: a quarter torus tipping the mast over into the horizontal.
  const bend = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.075, 6, 12, Math.PI / 2), steel);
  bend.rotation.y = Math.PI / 2;
  bend.rotation.z = Math.PI / 2;
  bend.position.set(1.05, 7.95, 0);
  bend.castShadow = true;
  g.add(bend);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 1.1, 8), steel);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(1.6, 9.0, 0);
  g.add(arm);

  // Lamp housing, tilted down the road, with the lens as a separate emissive
  // face so bloom picks up the lens and not the whole casing.
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.2, 0.42), steel);
  housing.rotation.z = 0.1;
  housing.position.set(2.35, 8.95, 0);
  housing.castShadow = true;
  g.add(housing);

  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.32), glow(0xffe6a8, 1.6));
  lens.rotation.z = 0.1;
  lens.position.set(2.35, 8.83, 0);
  g.add(lens);

  return g;
}

/**
 * Junction signal on a long mast arm, the way it hangs over the stop line in
 * the reference: pole, boom out over the carriageway, one signal head on the
 * boom and a pedestrian head down on the pole.
 *
 * `phase` picks which aspect is lit (0 red, 1 amber, 2 green) so a junction can
 * show a consistent state across its four corners.
 */
export const ASPECT_COLOURS = [0xff2e1f, 0xffb020, 0x2fdd58] as const;

export function makeTrafficLight(phase: 0 | 1 | 2 = 0): THREE.Group {
  const g = new THREE.Group();
  const steel = std(0x4a4f55, 0.5, 0.75);
  const casing = std(0x1e2126, 0.8, 0.1);
  /** Every lens on this mast, in red/amber/green order per head. */
  const lenses: THREE.Mesh[] = [];

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 7.2, 10), steel);
  pole.position.y = 3.6;
  pole.castShadow = true;
  g.add(pole);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.4, 10), steel);
  base.position.y = 0.2;
  g.add(base);

  // Boom out over the road, braced back to the mast.
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 5.4, 8), steel);
  boom.rotation.z = Math.PI / 2;
  boom.position.set(2.7, 7.1, 0);
  boom.castShadow = true;
  g.add(boom);

  const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), steel);
  brace.rotation.z = Math.PI / 4;
  brace.position.set(0.78, 6.3, 0);
  g.add(brace);

  /** A three-aspect head hanging from `y` at `x`, facing -Z. */
  const head = (x: number, y: number, scale: number) => {
    const h = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.12, 0.34), casing);
    body.castShadow = true;
    h.add(body);

    const lensGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.06, 12);
    ASPECT_COLOURS.forEach((c, i) => {
      const lens = new THREE.Mesh(lensGeo, glow(c, 0));
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 0.36 - i * 0.36, -0.18);
      lenses.push(lens);
      h.add(lens);

      // Hood over each aspect: real signals are unreadable without them and
      // they are most of what you actually see of the head from below.
      const hood = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.17, 0.16, 12, 1, true, Math.PI, Math.PI),
        casing
      );
      hood.rotation.x = Math.PI / 2;
      hood.position.set(0, 0.36 - i * 0.36, -0.26);
      h.add(hood);
    });

    h.position.set(x, y, 0);
    h.scale.setScalar(scale);
    g.add(h);
    return h;
  };

  head(4.6, 6.4, 1);
  head(0.34, 3.4, 0.62); // pedestrian head, down at eye level on the mast

  g.userData.lenses = lenses;
  setSignalPhase(g, phase);
  return g;
}

/**
 * Lights the given aspect (0 red, 1 amber, 2 green) on every head of a mast
 * built by `makeTrafficLight`. Unlit aspects are darkened rather than hidden:
 * a real signal head still shows three dull coloured discs.
 */
export function setSignalPhase(light: THREE.Group, phase: 0 | 1 | 2): void {
  if (light.userData.phase === phase) return;
  const lenses = light.userData.lenses as THREE.Mesh[] | undefined;
  if (!lenses) return;

  lenses.forEach((lens, i) => {
    const aspect = i % ASPECT_COLOURS.length;
    const lit = aspect === phase;
    const m = lens.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = lit ? 2.2 : 0;
    m.color.setHex(ASPECT_COLOURS[aspect]);
    if (!lit) m.color.multiplyScalar(0.22);
  });
  light.userData.phase = phase;
}

/**
 * Roadside peepal-ish tree.
 *
 * Two things do the work here. Branches: a canopy floating above a bare pole
 * reads as a lollipop, and a few forked limbs disappearing into the leaves fix
 * it for four extra meshes. And tonal variation between the foliage clumps —
 * a single flat green is the giveaway of a procedural tree, because real
 * canopies are self-shadowing and the underside clumps are much darker.
 */
export function makeTree(seed: number, leaf = 0x2f6b34, trunkColour = 0x5b4632): THREE.Group {
  const g = new THREE.Group();
  const rand = mulberry32(seed);

  const height = 3.0 + rand() * 1.4;
  const bark = std(trunkColour, 0.95, 0);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.36, height, 8),
    bark
  );
  trunk.position.y = height / 2;
  trunk.castShadow = true;
  g.add(trunk);

  // Root flare, so the trunk sits into the ground rather than on it.
  const flare = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.7, 8), bark);
  flare.position.y = 0.28;
  g.add(flare);

  const limbGeo = new THREE.CylinderGeometry(0.06, 0.13, 1.5, 5);
  const limbs = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rand();
    const limb = new THREE.Mesh(limbGeo, bark);
    limb.position.set(Math.cos(a) * 0.5, height - 0.15, Math.sin(a) * 0.5);
    limb.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    limb.castShadow = true;
    g.add(limb);
  }

  const base = new THREE.Color(leaf);
  const clumps = 6 + Math.floor(rand() * 3);
  for (let i = 0; i < clumps; i++) {
    // Lower clumps sit in the canopy's own shade; upper ones catch the sun.
    const t = i / (clumps - 1);
    const shade = base.clone().multiplyScalar(0.66 + t * 0.5);
    const r = 0.75 + rand() * 0.55;
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 1),
      std(shade.getHex(), 0.95, 0)
    );
    const a = rand() * Math.PI * 2;
    const spread = 0.5 + rand() * 1.05;
    blob.position.set(
      Math.cos(a) * spread,
      height + 0.4 + t * 1.5 + rand() * 0.3,
      Math.sin(a) * spread
    );
    blob.scale.set(1, 0.82, 1);
    blob.rotation.set(rand(), rand(), rand());
    blob.castShadow = true;
    g.add(blob);
  }

  return g;
}

/* ------------------------------------------------------------------ *
 * District landmarks
 * ------------------------------------------------------------------ */

/** Chennai: a beached fishing boat with a mast. */
export function makeBoat(): THREE.Group {
  const g = new THREE.Group();

  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 7.5), flat(0x2e6f9e));
  hull.position.y = 0.6;
  hull.castShadow = true;
  g.add(hull);

  const prow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 4), flat(0x2e6f9e));
  prow.rotation.x = -Math.PI / 2;
  prow.rotation.y = Math.PI / 4;
  prow.position.set(0, 0.6, 4.6);
  g.add(prow);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.22, 7.5), flat(0xe8b44a));
  stripe.position.y = 1.0;
  g.add(stripe);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 5.5, 6), flat(0x6b5340));
  mast.position.set(0, 3.3, -0.6);
  g.add(mast);

  const sail = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 3.4),
    flat(0xf2ece0, { side: THREE.DoubleSide })
  );
  sail.position.set(0.9, 3.6, -0.6);
  g.add(sail);

  return g;
}

/** Bengaluru: a lit hoarding on scaffold legs. */
export function makeBillboard(seed: number): THREE.Group {
  const g = new THREE.Group();
  const rand = mulberry32(seed);

  const legGeo = new THREE.CylinderGeometry(0.16, 0.2, 7, 6);
  [-2.2, 2.2].forEach((x) => {
    const leg = new THREE.Mesh(legGeo, flat(0x4a5057));
    leg.position.set(x, 3.5, 0);
    g.add(leg);
  });

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(6.4, 3.2, 0.24),
    flat([0x1f6feb, 0x8957e5, 0x1a7f64][Math.floor(rand() * 3)])
  );
  panel.position.y = 8.4;
  panel.castShadow = true;
  g.add(panel);

  // A bright band so it reads as a lit ad from a distance.
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(5.6, 0.5, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xf5f0dc })
  );
  band.position.set(0, 7.6, 0.04);
  g.add(band);

  return g;
}

/** Kolkata: a tram car on rails. */
export function makeTram(): THREE.Group {
  const g = new THREE.Group();
  const body = flat(0xd8b44a);

  const car = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 9), body);
  car.position.y = 1.9;
  car.castShadow = true;
  g.add(car);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 9.2), flat(0x8a6a3a));
  roof.position.y = 3.3;
  g.add(roof);

  // Window band down both flanks.
  [-1.32, 1.32].forEach((x) => {
    const w = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.9, 7.6),
      flat(0x2b3a44)
    );
    w.position.set(x, 2.4, 0);
    g.add(w);
  });

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), flat(0x39404a));
  pole.position.set(0, 4.4, -2);
  pole.rotation.x = 0.3;
  g.add(pole);

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.22, 10);
  [[-1.1, 3], [1.1, 3], [-1.1, -3], [1.1, -3]].forEach(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, flat(0x1a1a1d));
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.42, z);
    g.add(w);
  });

  return g;
}

/** Old Delhi: a shuttered bazaar gate arch. */
export function makeArch(): THREE.Group {
  const g = new THREE.Group();
  const stone = flat(0xb5651d);

  [-4, 4].forEach((x) => {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(1.6, 7, 1.6), stone);
    pier.position.set(x, 3.5, 0);
    pier.castShadow = true;
    g.add(pier);
  });

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, 1.8), stone);
  lintel.position.y = 7.8;
  lintel.castShadow = true;
  g.add(lintel);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    flat(0xd9c8a9)
  );
  dome.position.y = 8.6;
  g.add(dome);

  return g;
}
