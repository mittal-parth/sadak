/**
 * Surface & layer vocabulary.
 *
 * The twelve surface names are fixed by ARCHITECTURE.md — impact FX, decals,
 * footstep audio and this system all key off the same enum. Physics stores the
 * *index* per triangle (one byte) and hands the *name* back to callers, so
 * nobody outside this directory has to care about the packing.
 *
 * The numbers below are game-tuned but physically motivated: penetration depth
 * is roughly how much of the material a 7.62 x 51 round will defeat, friction
 * is a dry kinetic coefficient, restitution is measured drop-bounce.
 */

export const SURFACE_NAMES = [
  'concrete',
  'metal',
  'wood',
  'dirt',
  'sand',
  'glass',
  'water',
  'foliage',
  'fabric',
  'flesh',
  'rubber',
  'plaster',
];

export const SURFACE = /** @type {Record<string, number>} */ ({});
for (let i = 0; i < SURFACE_NAMES.length; i++) SURFACE[SURFACE_NAMES[i]] = i;

/**
 * Per-surface physical response.
 *
 * penDepth      metres of material a reference round (power 1.0) fully defeats.
 * energyLoss    fraction of remaining damage lost per penDepth traversed.
 * deflect       radians of random yaw/pitch scatter per penDepth traversed.
 * friction      dry kinetic coefficient (rigid bodies, ragdolls, footing).
 * restitution   bounce factor for debris.
 * density       kg/m^3, used for the impulse a body of unknown mass receives.
 * hardness      0..1 — spark/chip likelihood, drives fx choice.
 * shatters      the surface breaks rather than absorbs (glass).
 */
export const SURFACE_PROPS = [
  // concrete
  { penDepth: 0.055, energyLoss: 0.62, deflect: 0.055, friction: 0.92, restitution: 0.26, density: 2400, hardness: 0.95, shatters: false },
  // metal (structural steel / vehicle panel)
  { penDepth: 0.022, energyLoss: 0.7, deflect: 0.075, friction: 0.52, restitution: 0.44, density: 7800, hardness: 1.0, shatters: false },
  // wood
  { penDepth: 0.32, energyLoss: 0.3, deflect: 0.03, friction: 0.72, restitution: 0.3, density: 620, hardness: 0.4, shatters: false },
  // dirt
  { penDepth: 0.26, energyLoss: 0.45, deflect: 0.05, friction: 0.96, restitution: 0.09, density: 1500, hardness: 0.2, shatters: false },
  // sand
  { penDepth: 0.19, energyLoss: 0.55, deflect: 0.06, friction: 1.05, restitution: 0.04, density: 1600, hardness: 0.12, shatters: false },
  // glass
  { penDepth: 0.45, energyLoss: 0.12, deflect: 0.012, friction: 0.32, restitution: 0.2, density: 2500, hardness: 0.85, shatters: true },
  // water
  { penDepth: 1.1, energyLoss: 0.5, deflect: 0.09, friction: 0.3, restitution: 0.0, density: 1000, hardness: 0.0, shatters: false },
  // foliage
  { penDepth: 3.0, energyLoss: 0.05, deflect: 0.008, friction: 0.62, restitution: 0.06, density: 300, hardness: 0.05, shatters: false },
  // fabric
  { penDepth: 2.2, energyLoss: 0.06, deflect: 0.01, friction: 0.8, restitution: 0.05, density: 400, hardness: 0.02, shatters: false },
  // flesh
  { penDepth: 0.55, energyLoss: 0.35, deflect: 0.02, friction: 0.9, restitution: 0.05, density: 1050, hardness: 0.05, shatters: false },
  // rubber
  { penDepth: 0.28, energyLoss: 0.4, deflect: 0.04, friction: 1.25, restitution: 0.72, density: 1200, hardness: 0.1, shatters: false },
  // plaster / drywall
  { penDepth: 0.7, energyLoss: 0.12, deflect: 0.02, friction: 0.86, restitution: 0.14, density: 800, hardness: 0.25, shatters: false },
];

/** Resolve a surface name (or index, or undefined) to a valid index. */
export function surfaceIndex(s, fallback = SURFACE.concrete) {
  if (typeof s === 'number') return s >= 0 && s < SURFACE_NAMES.length ? s | 0 : fallback;
  if (typeof s === 'string') {
    const i = SURFACE[s];
    if (i !== undefined) return i;
    return guessSurface(s, fallback);
  }
  return fallback;
}

const GUESS = [
  [/concrete|cement|stone|brick|rock|asphalt|tarmac|road|kerb|curb|marble|tile/i, SURFACE.concrete],
  [/metal|steel|iron|alu|aluminium|aluminum|tin|pipe|rail|grate|vent|car|vehicle|chassis|barrel|drum|sign/i, SURFACE.metal],
  [/wood|timber|plank|crate|pallet|door|plywood|fence|log|furnit/i, SURFACE.wood],
  [/dirt|mud|soil|earth|ground|terrain|gravel|rubble/i, SURFACE.dirt],
  [/sand|dune|beach/i, SURFACE.sand],
  [/glass|window|mirror|screen|pane/i, SURFACE.glass],
  [/water|pool|puddle|liquid/i, SURFACE.water],
  [/foliage|leaf|leaves|bush|tree|grass|plant|hedge|shrub/i, SURFACE.foliage],
  [/fabric|cloth|canvas|tarp|curtain|carpet|rug|sofa|awning/i, SURFACE.fabric],
  [/flesh|body|skin|head|torso|limb|enemy|actor|char/i, SURFACE.flesh],
  [/rubber|tyre|tire|hose|mat/i, SURFACE.rubber],
  [/plaster|drywall|gypsum|stucco|wall|ceiling|partition/i, SURFACE.plaster],
];

/** Best-effort surface inference from a mesh/material name. */
export function guessSurface(name, fallback = SURFACE.concrete) {
  if (!name) return fallback;
  for (let i = 0; i < GUESS.length; i++) if (GUESS[i][0].test(name)) return GUESS[i][1];
  return fallback;
}

export function surfaceName(i) {
  return SURFACE_NAMES[i] ?? 'concrete';
}

/* ------------------------------------------------------------------ */
/* Collision layers                                                    */
/* ------------------------------------------------------------------ */

export const LAYER = {
  /** Immovable level geometry. */ STATIC: 1 << 0,
  /** Static props — crates, cars. Same BVH, separate bit so AI can ignore. */ PROP: 1 << 1,
  /** Simulated debris & dropped weapons. */ DEBRIS: 1 << 2,
  /** Player capsule. */ PLAYER: 1 << 3,
  /** AI character capsules / hitboxes. */ ACTOR: 1 << 4,
  /** Ragdoll bones. */ RAGDOLL: 1 << 5,
  /** Breakable glass — blocks bullets briefly, never blocks sight. */ GLASS: 1 << 6,
  /** Water volumes. */ WATER: 1 << 7,
  /** Invisible clip: stops characters, ignored by bullets and cameras. */ CLIP: 1 << 8,
  /** Blocks bullets but not movement (grates, railings modelled thin). */ SHOOT_ONLY: 1 << 9,
  /** Non-colliding trigger volume. */ TRIGGER: 1 << 10,
  /** Foliage — no collision, deflects bullets barely, blocks nothing. */ FOLIAGE: 1 << 11,
};

export const MASK = {
  ALL: 0xffff & ~LAYER.TRIGGER,
  /** Everything a character capsule collides with. */
  CHARACTER: LAYER.STATIC | LAYER.PROP | LAYER.CLIP,
  /** Everything a bullet can strike. */
  BULLET:
    LAYER.STATIC | LAYER.PROP | LAYER.DEBRIS | LAYER.ACTOR | LAYER.RAGDOLL |
    LAYER.GLASS | LAYER.SHOOT_ONLY | LAYER.FOLIAGE,
  /** Static-only: camera collision, cover queries, decal projection. */
  WORLD: LAYER.STATIC | LAYER.PROP,
  /** Line of sight — glass and foliage do not block vision. */
  SIGHT: LAYER.STATIC | LAYER.PROP | LAYER.DEBRIS,
  /** What rigid debris bounces off. */
  DEBRIS: LAYER.STATIC | LAYER.PROP | LAYER.CLIP,
  /** Explosion occlusion. */
  EXPLOSION: LAYER.STATIC | LAYER.PROP,
};
