import * as THREE from 'three';

/**
 * Where the sun and moon actually are.
 *
 * Standard spherical astronomy: declination from the day of year, hour angle
 * from local solar time, then the altitude/azimuth transform for the site
 * latitude. Nothing is hand-placed, so the shots that matter come out of one
 * consistent sky rather than three separate art passes.
 *
 * Site and date are chosen so the graded times land where the shot list says
 * they should (lat 45N, summer solstice, sunset at 19.71):
 *
 *   16.50  sun +32.0 deg, azimuth 272 (due west)   — hard afternoon key
 *   19.20  sun  +4.6 deg, azimuth 299 (WNW)        — golden hour, disc in frame
 *   01.50  sun -18.6 deg                           — full night
 *          moon +21.7 deg, azimuth 288 (W)         — half-lit, in frame
 *
 * Azimuth convention: 0 = north = -Z, 90 = east = +X. `northAngle` rotates the
 * whole celestial sphere for art direction without touching the astronomy.
 */

export const SITE = {
  latitudeDeg: 45.0,
  dayOfYear: 172, // summer solstice
  /** Rotates north in world space. 0 keeps north at -Z. */
  northAngleDeg: 0,
  /**
   * Moon hour angle offset from the sun, degrees, and lunar declination.
   *
   * 244 / +28 (the moon's real declination limit) puts the moon at altitude 22 /
   * azimuth 288 at 01:30, which is INSIDE the night shot's frustum — the old
   * 216.8 / +12 put it at azimuth 250, twenty degrees off the left edge, so the
   * one frame that exists to show a moonlit street had no moon in it. At this
   * declination it is also 58% illuminated, so the terminator reads and the disc
   * is a sphere rather than a flat white dot.
   */
  moonHourOffsetDeg: 244.0,
  moonDeclinationDeg: 28.0,
};

const DEG = Math.PI / 180;

/** Solar declination, Cooper's approximation. */
export function solarDeclination(dayOfYear) {
  return 23.44 * DEG * Math.sin(((2 * Math.PI) / 365) * (284 + dayOfYear));
}

/**
 * Altitude/azimuth for a body at a given hour angle and declination.
 * `hourAngle` in radians, 0 at local meridian, positive in the afternoon.
 */
export function altAz(hourAngle, declination, latitudeDeg, out = { alt: 0, az: 0 }) {
  const lat = latitudeDeg * DEG;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinD = Math.sin(declination);
  const cosD = Math.cos(declination);
  const sinAlt = sinLat * sinD + cosLat * cosD * Math.cos(hourAngle);
  const alt = Math.asin(THREE.MathUtils.clamp(sinAlt, -1, 1));
  const cosAlt = Math.cos(alt);
  let cosAz = 0;
  if (cosAlt > 1e-6 && cosLat > 1e-6) {
    cosAz = (sinD - sinAlt * sinLat) / (cosAlt * cosLat);
  }
  let az = Math.acos(THREE.MathUtils.clamp(cosAz, -1, 1));
  // Hour angle positive = past the meridian = western half of the sky.
  if (Math.sin(hourAngle) > 0) az = 2 * Math.PI - az;
  out.alt = alt;
  out.az = az;
  return out;
}

/** World-space unit vector from altitude/azimuth. Points *toward* the body. */
export function dirFromAltAz(alt, az, northAngleRad, out) {
  const a = az + northAngleRad;
  const ca = Math.cos(alt);
  return out.set(ca * Math.sin(a), Math.sin(alt), -ca * Math.cos(a)).normalize();
}

/**
 * Full celestial state for an hour of the day.
 * `sun`/`moon` are unit world directions pointing at the body.
 */
export class Celestial {
  constructor(site = SITE) {
    this.site = { ...site };
    this.sun = new THREE.Vector3(0, 1, 0);
    this.moon = new THREE.Vector3(0, -1, 0);
    this.sunAlt = 0;
    this.sunAz = 0;
    this.moonAlt = 0;
    this.moonAz = 0;
    /** Illuminated fraction of the lunar disc, 0..1. */
    this.moonPhase = 1;
    /** Angular separation sun-moon; drives the terminator on the disc. */
    this.moonElongation = Math.PI;
    this._aa = { alt: 0, az: 0 };
    this._m = new THREE.Matrix4();
    this._tilt = new THREE.Matrix4();
  }

  setHour(hour) {
    const s = this.site;
    const north = s.northAngleDeg * DEG;
    const decl = solarDeclination(s.dayOfYear);
    const H = (hour - 12) * 15 * DEG;

    altAz(H, decl, s.latitudeDeg, this._aa);
    this.sunAlt = this._aa.alt;
    this.sunAz = this._aa.az;
    dirFromAltAz(this.sunAlt, this.sunAz, north, this.sun);

    const Hm = H + s.moonHourOffsetDeg * DEG;
    altAz(Hm, s.moonDeclinationDeg * DEG, s.latitudeDeg, this._aa);
    this.moonAlt = this._aa.alt;
    this.moonAz = this._aa.az;
    dirFromAltAz(this.moonAlt, this.moonAz, north, this.moon);

    this.moonElongation = Math.acos(THREE.MathUtils.clamp(this.sun.dot(this.moon), -1, 1));
    this.moonPhase = 0.5 * (1 - Math.cos(this.moonElongation));

    // Equatorial -> world rotation for the starfield: the sky turns 15 deg/hour
    // about the polar axis, which is tilted from vertical by (90 - latitude).
    const polarTilt = (90 - s.latitudeDeg) * DEG;
    this._m.makeRotationY(-H + north);
    this._m.premultiply(this._tilt.makeRotationX(polarTilt));
    return this;
  }

  /** THREE.Matrix3 usable as a `mat3` uniform, world dir -> fixed sky. */
  celestialMatrix(out) {
    return out.setFromMatrix4(this._m);
  }
}
