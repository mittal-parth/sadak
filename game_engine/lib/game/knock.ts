/**
 * A vehicle meeting the player. A moving one knocks them out across its path
 * (never along it, which is what carried people off on the bumper) with a
 * shove; a parked or crawling one only nudges them out of its box.
 */

export type VehicleBox = { x: number; z: number; yaw: number; halfWidth: number; halfLength: number; speed: number };

export type Knock = {
  /** Where the player ends up: just outside the vehicle. */
  x: number;
  z: number;
  /** Shove velocity, m/s, or null for a plain nudge. */
  shove: { x: number; z: number } | null;
};

/** Null when the player (radius r at px, pz) is clear of the vehicle. */
export function knockFrom(v: VehicleBox, px: number, pz: number, r: number, blocked: (x: number, z: number) => boolean): Knock | null {
  const dx = px - v.x;
  const dz = pz - v.z;
  if (dx * dx + dz * dz > (v.halfLength + r + 1) ** 2) return null;
  // Into the vehicle's frame: u across, w along its length (forward is
  // (sin yaw, cos yaw)).
  const c = Math.cos(v.yaw);
  const s = Math.sin(v.yaw);
  const u = dx * c - dz * s;
  const w = dx * s + dz * c;
  const hu = v.halfWidth + r;
  const hw = v.halfLength + r;
  if (Math.abs(u) >= hu || Math.abs(w) >= hw) return null;
  const moving = v.speed > 0.8;
  let nu = u;
  let nw = w;
  if (moving || hu - Math.abs(u) < hw - Math.abs(w)) nu = Math.sign(u || 1) * (hu + 0.05);
  else nw = Math.sign(w || 1) * (hw + 0.05);
  const at = (a: number, b: number) => [v.x + a * c + b * s, v.z - a * s + b * c] as const;
  let [x, z] = at(nu, nw);
  // Thrown toward a wall: the other side instead.
  if (moving && blocked(x, z)) {
    nu = -nu;
    [x, z] = at(nu, nw);
  }
  if (!moving) return { x, z, shove: null };
  // Across the vehicle toward the side they went, with some of its own
  // speed forward.
  const side = Math.sign(nu);
  const across = Math.min(7, 2.5 + v.speed * 0.6);
  const along = v.speed * 0.4;
  return { x, z, shove: { x: side * c * across + s * along, z: -side * s * across + c * along } };
}
