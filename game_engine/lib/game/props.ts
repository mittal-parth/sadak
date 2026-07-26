import * as THREE from "three";

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

export function makeAuto(canopyColour = 0xf5c518): THREE.Group {
  const g = new THREE.Group();

  const black = flat(0x111318);
  const yellow = flat(canopyColour);

  // Lower body: the black skirt.
  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 2.4), black);
  lower.position.y = 0.65;
  lower.castShadow = true;
  g.add(lower);

  // Yellow canopy.
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.9, 1.7), yellow);
  canopy.position.set(0, 1.5, -0.2);
  canopy.castShadow = true;
  g.add(canopy);

  // Rounded front cowl.
  const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 10), yellow);
  cowl.scale.set(1, 0.95, 0.85);
  cowl.position.set(0, 1.25, 1.05);
  g.add(cowl);

  // Roof.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.12, 2.0), yellow);
  roof.position.set(0, 2.0, -0.1);
  g.add(roof);

  // Windscreen.
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.6, 0.06),
    new THREE.MeshLambertMaterial({ color: 0x89c4d8, transparent: true, opacity: 0.55 })
  );
  glass.position.set(0, 1.6, 0.68);
  g.add(glass);

  // Headlight.
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4 })
  );
  lamp.position.set(0, 1.3, 1.45);
  g.add(lamp);

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12);
  const wheelMat = flat(0x0b0b0d);
  const wheelAt = (x: number, z: number) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.34, z);
    w.castShadow = true;
    g.add(w);
    return w;
  };
  // Three wheels: one at the front, two at the back.
  wheelAt(0, 1.15);
  wheelAt(-0.78, -0.85);
  wheelAt(0.78, -0.85);

  return g;
}

/* ------------------------------------------------------------------ *
 * Cow
 * ------------------------------------------------------------------ */

export function makeCow(): THREE.Group {
  const g = new THREE.Group();
  const hide = flat(0xf2ece3);
  const dark = flat(0x8a7f72);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 1.85), hide);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);

  // Brahman shoulder hump: what makes it read as an Indian cow.
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), hide);
  hump.scale.set(1, 0.85, 1.2);
  hump.position.set(0, 1.62, 0.42);
  g.add(hump);

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), hide);
  neck.position.set(0, 1.2, 1.0);
  g.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.72), hide);
  head.position.set(0, 1.08, 1.42);
  g.add(head);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.2), dark);
  snout.position.set(0, 0.99, 1.8);
  g.add(snout);

  // Horns.
  const hornGeo = new THREE.ConeGeometry(0.075, 0.42, 7);
  const hornMat = flat(0xd8cbb4);
  [-0.17, 0.17].forEach((x) => {
    const horn = new THREE.Mesh(hornGeo, hornMat);
    horn.position.set(x, 1.42, 1.3);
    horn.rotation.z = x > 0 ? -0.5 : 0.5;
    g.add(horn);
  });

  // Ears.
  [-0.3, 0.3].forEach((x) => {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.16), hide);
    ear.position.set(x, 1.2, 1.28);
    g.add(ear);
  });

  // Dewlap.
  const dewlap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.5), hide);
  dewlap.position.set(0, 0.92, 0.95);
  g.add(dewlap);

  const legGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.62, 7);
  [
    [-0.32, 0.62], [0.32, 0.62],
    [-0.32, -0.6], [0.32, -0.6],
  ].forEach(([x, z]) => {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(x, 0.31, z);
    g.add(leg);
  });

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.85, 6), hide);
  tail.position.set(0, 1.05, -0.95);
  tail.rotation.x = 0.32;
  g.add(tail);

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

  return g;
}

export function makeStreetLight(): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, 6, 7),
    flat(0x4c5157)
  );
  pole.position.y = 3;
  g.add(pole);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.1), flat(0x4c5157));
  arm.position.set(0.6, 5.95, 0);
  g.add(arm);

  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.16, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xffe6a8 })
  );
  lamp.position.set(1.2, 5.85, 0);
  g.add(lamp);

  return g;
}

/** Roadside peepal-ish tree. */
export function makeTree(seed: number, leaf = 0x2f6b34, trunkColour = 0x5b4632): THREE.Group {
  const g = new THREE.Group();
  const rand = mulberry32(seed);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 2.6, 7),
    flat(trunkColour)
  );
  trunk.position.y = 1.3;
  trunk.castShadow = true;
  g.add(trunk);

  const leafMat = flat(leaf);
  for (let i = 0; i < 4; i++) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.9 + rand() * 0.6, 9, 7), leafMat);
    blob.position.set((rand() - 0.5) * 1.5, 2.9 + rand() * 1.0, (rand() - 0.5) * 1.5);
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

/** Simple blocky pedestrian / NPC body. */
export function makeCharacter(shirt: number, skin = 0x8d5524): THREE.Group {
  const g = new THREE.Group();

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.32), flat(0x2c3e50));
  legs.position.y = 0.43;
  legs.castShadow = true;
  g.add(legs);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.38), flat(shirt));
  torso.position.y = 1.25;
  torso.castShadow = true;
  g.add(torso);

  const armGeo = new THREE.BoxGeometry(0.17, 0.72, 0.19);
  const skinMat = flat(skin);
  [-0.4, 0.4].forEach((x) => {
    const arm = new THREE.Mesh(armGeo, skinMat);
    arm.position.set(x, 1.25, 0);
    g.add(arm);
  });

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.42), skinMat);
  head.position.y = 1.9;
  head.castShadow = true;
  g.add(head);

  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.45), flat(0x14100c));
  hair.position.y = 2.14;
  g.add(hair);

  return g;
}
