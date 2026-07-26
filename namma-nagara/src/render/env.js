import * as THREE from 'three';

/**
 * Fallback image-based lighting.
 *
 * The sky subsystem owns the real physical sky and its IBL. Until it hands us
 * one (`scene.environment`), the renderer must still produce plausible
 * indirect light rather than black ambient, so we synthesise an analytic sky
 * into a half-float equirectangular texture and run it through PMREM.
 *
 * Values are radiometric-ish (a clear sky zenith around 8 cd/m^2 relative to
 * a sun of ~30), so exposure has something physical to work with.
 */

function skyRadiance(dir, sunDir, out) {
  const cosTheta = Math.max(-0.2, dir.y);
  const cosGamma = dir.x * sunDir.x + dir.y * sunDir.y + dir.z * sunDir.z;
  const gamma = Math.acos(Math.min(1, Math.max(-1, cosGamma)));

  const sunUp = Math.max(0.0, sunDir.y);
  const dayFactor = Math.pow(Math.max(0.02, sunUp), 0.45);

  // Rayleigh: bright near the horizon, deep blue at zenith.
  const horizon = Math.pow(1.0 - Math.max(0, cosTheta), 5.0);
  const zenith = [0.14, 0.28, 0.62];
  const horizonCol = [0.72, 0.76, 0.82];
  let r = zenith[0] + (horizonCol[0] - zenith[0]) * horizon;
  let g = zenith[1] + (horizonCol[1] - zenith[1]) * horizon;
  let b = zenith[2] + (horizonCol[2] - zenith[2]) * horizon;

  // Mie forward scattering around the sun.
  const mie = 1.5 * Math.exp(-gamma * 3.2) + 0.35 * Math.exp(-gamma * 0.6);
  const warm = [1.0, 0.72, 0.42];
  r += mie * warm[0] * 0.55;
  g += mie * warm[1] * 0.55;
  b += mie * warm[2] * 0.55;

  // Warm the low sun.
  const lowSun = Math.pow(1.0 - Math.min(1, sunUp * 2.4), 2.0);
  r *= 1.0 + lowSun * 0.5;
  g *= 1.0 - lowSun * 0.12;
  b *= 1.0 - lowSun * 0.35;

  // Scaled so sky irradiance is ~20% of a 4.0-intensity sun, which is the
  // clear-daylight ratio. Ambient that overpowers the key light is the
  // single fastest way to make a scene look like a WebGL demo.
  let scale = 0.34 * dayFactor;

  if (dir.y < 0.0) {
    // ground bounce: dry concrete/dirt albedo, darker and warmer
    const t = Math.min(1, -dir.y * 3.0);
    const gr = 0.62;
    out[0] = (r * (1 - t) + gr * 1.05 * t) * scale;
    out[1] = (g * (1 - t) + gr * 0.95 * t) * scale;
    out[2] = (b * (1 - t) + gr * 0.78 * t) * scale;
    return out;
  }

  out[0] = r * scale;
  out[1] = g * scale;
  out[2] = b * scale;
  return out;
}

export function buildFallbackEnvironment(renderer, sunDir) {
  const W = 512;
  const H = 256;
  const data = new Uint16Array(W * H * 4);
  const dir = new THREE.Vector3();
  const rgb = [0, 0, 0];
  const toHalf = THREE.DataUtils.toHalfFloat;

  let p = 0;
  for (let y = 0; y < H; y++) {
    // DataTexture rows start at the bottom of the image in GL, so row 0 must
    // be the nadir for an equirectangular map to come out the right way up.
    const theta = (1 - (y + 0.5) / H) * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let x = 0; x < W; x++) {
      const phi = ((x + 0.5) / W) * Math.PI * 2 - Math.PI;
      dir.set(sinT * Math.sin(phi), cosT, sinT * Math.cos(phi));
      skyRadiance(dir, sunDir, rgb);
      data[p++] = toHalf(rgb[0]);
      data[p++] = toHalf(rgb[1]);
      data[p++] = toHalf(rgb[2]);
      data[p++] = toHalf(1);
    }
  }

  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const target = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  target.texture.name = 'ow-fallback-env';
  // The equirect is kept alive so it can also serve as a stand-in background
  // until the sky subsystem paints a real one.
  return { target, equirect: tex };
}
