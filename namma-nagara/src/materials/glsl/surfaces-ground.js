/**
 * Ground surfaces: asphalt, sand, dirt, gravel. These are usually triplanar
 * or planar-projected and are the surfaces most prone to visible tiling, so
 * they carry strong low-frequency content that the macro-variation layer in
 * the material shader can push around.
 *
 * NYQUIST BUDGET (read this before adding a band). Every generator writes
 * `p = uv * 8`, so a term at `p * K` lays 8K cells across the bake, and at a
 * bake of N texels that is N/(8K) texels per cell. Under ~5 texels the cell is
 * not a feature, it is white noise: mip 0 shows salt-and-pepper dither and
 * mip 1 has already averaged it to a flat wash. That single mistake is what
 * made the whole street read as sandpaper at 3 m and as flat colour at 15 m.
 * All ground bakes are 1024, so K is capped at 24 (5.3 texels) and the
 * sub-millimetre read is delegated to the shared detail map, which is tiled
 * ten times finer and has the texel budget for it.
 */

export const ASPHALT = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  vec2 p = uv * P + uSeed * 6.9;

  // ---- binder: dark, slightly blue-grey, sun-bleached in patches ----
  float macro = owFbm01(p * 0.55, P * 0.5, 4, 0.6);
  float mid   = owFbm01(p * 3.0, P * 3.0, 5, 0.5);
  float fine  = owFbm01(p * 16.0, P * 16.0, 4, 0.5);

  vec3 cFresh = owSRGB(vec3(0.115, 0.115, 0.122));
  vec3 cWorn  = owSRGB(vec3(0.300, 0.298, 0.295));
  vec3 c = mix(cFresh, cWorn, smoothstep(0.25, 0.85, macro) * 0.85);
  // Half the old fine-grain albedo contrast: the stone read belongs in the
  // height/normal channels, not in a high-frequency albedo dither.
  c *= 0.94 + 0.12 * fine;

  h = 0.60 + (mid - 0.5) * 0.06;
  rough = 0.78 + (mid - 0.5) * 0.10 + (fine - 0.5) * 0.14;
  metal = 0.0;
  ao = 1.0;

  // ---- aggregate: dense angular chippings, three grades ----
  // Angularity comes from warping the worley domain: round cells become
  // faceted, which is what separates asphalt from a pebble beach.
  vec2 ap = owWarp(p, P, 0.10, 3);
  vec4 big = owWorley(ap * 12.0, P * 12.0, 1.0);
  float bigM = smoothstep(0.40, 0.16, big.x);
  float bigExposed = bigM * smoothstep(0.30, 0.62, owFbm01(p * 2.2 + 3.0, P * 2.0, 4, 0.5) + big.w * 0.5);
  vec4 small = owWorley(ap * 22.0 + 7.0, P * 22.0, 1.0);
  float smallM = smoothstep(0.36, 0.10, small.x);
  float smallExposed = smallM * step(0.30, small.w);
  vec4 grit = owWorley(ap * 28.0 + 3.0, P * 28.0, 1.0);
  float gritM = smoothstep(0.32, 0.06, grit.x) * step(0.45, grit.z);

  vec3 stoneA = owSRGB(vec3(0.400, 0.392, 0.378));
  vec3 stoneB = owSRGB(vec3(0.210, 0.200, 0.192));
  vec3 stoneC = owSRGB(vec3(0.560, 0.520, 0.470));
  vec3 stone = mix(stoneA, stoneB, big.z);
  stone = mix(stone, stoneC, step(0.90, big.w));

  // Stones are read by their relief and their specular, not by their tint:
  // colour contrast is roughly halved and the height contribution raised.
  c = mix(c, stone, bigExposed * 0.52);
  c = mix(c, mix(stoneA, stoneC, small.z), smallExposed * 0.22);
  c = mix(c, mix(stoneB, stoneA, grit.z), gritM * 0.14);
  h += bigExposed * 0.15 * (0.6 + 0.6 * big.z) + smallExposed * 0.065 + gritM * 0.022;
  rough += bigExposed * (0.10 - 0.22 * big.z) + smallExposed * (0.06 - 0.14 * small.z);

  // voids between the aggregate — where the binder has ravelled out
  float voidM = smoothstep(0.50, 0.85, big.x) * smoothstep(0.28, 0.6, small.x);
  h -= voidM * 0.10;
  ao -= voidM * 0.14;

  // ---- tyre polish: two smooth bands where wheels track ----
  float lane = abs(fract(uv.x * 1.0 + 0.25) - 0.5) * 2.0;
  float polish = (1.0 - smoothstep(0.10, 0.62, lane)) *
                 smoothstep(0.25, 0.65, owFbm01(vec2(p.x * 0.7, p.y * 5.0), vec2(P.x, P.y * 5.0), 4, 0.5));
  rough -= polish * 0.16;
  h -= polish * 0.012;
  c = mix(c, c * 0.78 + owSRGB(vec3(0.045, 0.045, 0.048)), polish * 0.45);

  // ---- patch repairs: darker rectangles-ish with a seam ----
  vec4 rep = owWorley(owWarp(p * 0.5 + 13.0, P * 0.5, 1.6, 3), P * 0.5, 0.9);
  float inPatch = step(0.72, rep.w);
  float patchEdge = (1.0 - smoothstep(0.0, 0.06, rep.y - rep.x)) * inPatch;
  c = mix(c, cFresh * (0.85 + 0.35 * fine), inPatch * 0.20);
  rough = mix(rough, 0.84, inPatch * 0.22);
  h -= patchEdge * 0.07;
  ao -= patchEdge * 0.20;
  c = mix(c, cFresh * 0.5, patchEdge * 0.35);
  // tar bleeding out of the seam, glossy
  float tar = patchEdge * smoothstep(0.4, 0.7, owFbm01(p * 6.0, P * 6.0, 3, 0.5));
  rough -= tar * 0.35;
  c = mix(c, owSRGB(vec3(0.055, 0.055, 0.058)), tar * 0.7);

  // ---- alligator cracking + long thermal cracks ----
  float gator = owCracks(p * 3.4, P * 3.4, 0.9, 0.032, 0.56);
  float thermal = owCracks(p * 0.9 + 41.0, P * 0.9, 0.75, 0.05, 0.70);
  float crack = clamp(gator + thermal, 0.0, 1.0);
  h -= crack * 0.16;
  ao -= crack * 0.30;
  c = mix(c, owSRGB(vec3(0.045, 0.043, 0.042)), crack * 0.85);
  rough += crack * 0.12;

  // ---- oil stains, dark and slightly glossy ----
  float oil = smoothstep(0.68, 0.90, owFbm01(owWarp(p * 1.8 + 31.0, P * 1.8, 0.9, 3), P * 1.8, 4, 0.55));
  c = mix(c, owSRGB(vec3(0.045, 0.043, 0.046)), oil * 0.6);
  rough -= oil * 0.16;

  // ---- dust settled in the low spots ----
  float dust = smoothstep(0.55, 0.30, h) * smoothstep(0.35, 0.75, macro);
  c = mix(c, owSRGB(vec3(0.420, 0.390, 0.340)), dust * 0.35);
  rough += dust * 0.10;

  alb = clamp(c, vec3(0.02), vec3(0.75));
  rough = clamp(rough, 0.44, 0.99);
  // see the AO note in GRAVEL: on a ground plane this channel is the shading
  ao = clamp(ao, 0.68, 1.0);
  h = clamp(h, 0.0, 1.0);
}
`;

export const SAND = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  vec2 p = uv * P + uSeed * 8.2;

  // ---- wind ripples: sheared sine, gently warped so the crests meander ----
  vec2 rp = owShear(p * 1.0, 1.0, 1.0);
  float warp = owFbm(p * 0.9, P * 0.9, 3, 0.55);
  float ripple = sin((rp.y * 1.0 + warp * 0.55) * 6.28318);
  // asymmetric profile: gentle windward slope, sharp lee crest
  ripple = ripple * 0.5 + 0.5;
  ripple = pow(ripple, 1.7) * 0.75 + ripple * 0.25;
  float rippleAmp = smoothstep(0.20, 0.70, owFbm01(p * 0.7, P * 0.7, 3, 0.6));
  float secondary = sin((p.y * 3.0 + p.x * 1.0 + warp * 0.8) * 6.28318) * 0.5 + 0.5;

  float dune = owFbm01(p * 0.5, P * 0.5, 4, 0.6);
  float mid  = owFbm01(p * 5.0, P * 5.0, 5, 0.5);
  float grain = owFbm01(p * 18.0, P * 18.0, 4, 0.55);
  vec4 gcell = owWorley(p * 24.0, P * 24.0, 1.0);

  h = 0.50 + (dune - 0.5) * 0.16 + (mid - 0.5) * 0.05
    + (ripple - 0.5) * 0.26 * rippleAmp + (secondary - 0.5) * 0.06 * rippleAmp
    + (grain - 0.5) * 0.018;

  vec3 cLight = owSRGB(vec3(0.760, 0.660, 0.480));
  vec3 cMid   = owSRGB(vec3(0.610, 0.510, 0.360));
  vec3 cDamp  = owSRGB(vec3(0.360, 0.290, 0.205));
  vec3 c = mix(cMid, cLight, smoothstep(0.3, 0.8, dune));
  c = mix(c, cDamp, smoothstep(0.62, 0.28, h) * 0.55);           // damp in the hollows
  // coarse grains collect on the crests, fines in the troughs
  c = mix(c, cLight * 1.06, smoothstep(0.45, 0.85, ripple) * rippleAmp * 0.35);
  c = mix(c, cMid * 0.88, smoothstep(0.45, 0.10, ripple) * rippleAmp * 0.30);
  c *= 0.90 + 0.18 * grain;
  // sparkle from quartz grains
  c += smoothstep(0.22, 0.0, gcell.x) * step(0.86, gcell.z) * 0.10;

  rough = 0.90 + (grain - 0.5) * 0.10 - smoothstep(0.6, 0.3, h) * 0.12;
  metal = 0.0;
  ao = 1.0 - smoothstep(0.55, 0.25, h) * 0.10;

  // ---- pebbles and shell fragments sitting on top ----
  vec4 peb = owWorley(p * 18.0, P * 18.0, 1.0);
  float pebble = smoothstep(0.30, 0.10, peb.x) * step(0.80, peb.w);
  vec3 pcol = mix(owSRGB(vec3(0.400, 0.370, 0.330)), owSRGB(vec3(0.690, 0.660, 0.620)), peb.z);
  c = mix(c, pcol, pebble * 0.85);
  h += pebble * 0.05;
  rough = mix(rough, 0.55 + 0.25 * peb.z, pebble * 0.8);
  ao -= smoothstep(0.40, 0.30, peb.x) * step(0.80, peb.w) * 0.08;

  // ---- scattered dry debris / dark mineral streaks ----
  float streak = smoothstep(0.62, 0.88, owFbm01(owShear(p * 2.5, 2.0, 4.0), owShearPer(P * 2.5, 4.0), 4, 0.5));
  c = mix(c, cDamp * 1.1, streak * 0.22);

  alb = clamp(c, vec3(0.02), vec3(0.82));
  rough = clamp(rough, 0.35, 0.99);
  ao = clamp(ao, 0.80, 1.0);
  h = clamp(h, 0.0, 1.0);
}
`;

export const DIRT = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  vec2 p = uv * P + uSeed * 3.4;

  float macro = owFbm01(p * 0.6, P * 0.6, 4, 0.62);
  float clump = owBillow(owWarp(p * 3.0, P * 3.0, 0.6, 3), P * 3.0, 5, 0.55);
  float fine  = owFbm01(p * 14.0, P * 14.0, 4, 0.5);
  float micro = owFbm01(p * 22.0, P * 22.0, 3, 0.5);

  vec3 cDry  = owSRGB(vec3(0.430, 0.350, 0.255));
  vec3 cWet  = owSRGB(vec3(0.185, 0.140, 0.100));
  vec3 cPale = owSRGB(vec3(0.560, 0.490, 0.385));
  vec3 c = mix(cDry, cPale, smoothstep(0.45, 0.9, macro));
  c = mix(c, cWet, smoothstep(0.55, 0.15, macro) * 0.8);
  // Halved high-frequency albedo contrast; the read moves into height/roughness.
  c *= 0.94 + 0.11 * fine;
  c *= 0.975 + 0.05 * micro;

  h = 0.55 + (macro - 0.5) * 0.14 + (clump - 0.5) * 0.16 + (fine - 0.5) * 0.075;
  rough = 0.88 + (fine - 0.5) * 0.14 + (micro - 0.5) * 0.10;
  metal = 0.0;
  ao = 1.0;

  // dried mud cracks in the flat pans
  float pan = smoothstep(0.35, 0.65, macro);
  float mud = owCracks(p * 2.4, P * 2.4, 0.85, 0.045, 0.35) * pan;
  h -= mud * 0.16;
  ao -= mud * 0.32;
  c = mix(c, cWet * 0.7, mud * 0.75);
  // the mud plates curl up at their edges
  float plateLift = smoothstep(0.10, 0.0, mud) * pan;
  h += plateLift * 0.01;

  // stones of two grades
  vec4 st = owWorley(p * 11.0, P * 11.0, 1.0);
  float stone = smoothstep(0.30, 0.11, st.x) * step(0.62, st.w);
  vec3 scol = mix(owSRGB(vec3(0.330, 0.315, 0.295)), owSRGB(vec3(0.600, 0.575, 0.540)), st.z);
  c = mix(c, scol, stone * 0.6);
  h += stone * 0.085;
  rough = mix(rough, 0.52 + 0.28 * st.z, stone * 0.8);
  ao -= smoothstep(0.36, 0.28, st.x) * step(0.62, st.w) * 0.10;

  vec4 grit = owWorley(p * 22.0, P * 22.0, 1.0);
  float gritM = smoothstep(0.26, 0.08, grit.x) * step(0.55, grit.w);
  c = mix(c, mix(scol, cPale, grit.z), gritM * 0.4);
  h += gritM * 0.015;

  // dead grass / organic litter
  float litter = smoothstep(0.70, 0.86, owFbm01(owShear(p * 8.0, 1.0, 5.0), owShearPer(P * 8.0, 5.0), 4, 0.5));
  litter *= smoothstep(0.4, 0.8, macro);
  c = mix(c, owSRGB(vec3(0.330, 0.290, 0.160)), litter * 0.5);
  h += litter * 0.012;
  rough += litter * 0.05;

  // sparse moss in the damp low spots
  float moss = smoothstep(0.74, 0.92, owFbm01(p * 4.5 + 19.0, P * 4.5, 5, 0.6)) * smoothstep(0.5, 0.1, macro);
  c = mix(c, owSRGB(vec3(0.150, 0.185, 0.105)), moss * 0.65);

  float cavity = 1.0 - smoothstep(0.40, 0.70, h);
  ao -= cavity * 0.14;

  alb = clamp(c, vec3(0.02), vec3(0.72));
  rough = clamp(rough, 0.45, 0.99);
  ao = clamp(ao, 0.72, 1.0);
  h = clamp(h, 0.0, 1.0);
}
`;

export const GRAVEL = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  vec2 p = uv * P + uSeed * 2.7;

  float bed = owFbm01(p * 1.3, P * 1.3, 4, 0.55);

  /**
   * This is the street. Not a bed of loose chippings — compacted dust and grit
   * with aggregate part-buried in it, which is what a Levantine back street
   * actually is, and much more importantly it is what stops twelve metres of
   * road reading as dither.
   *
   * Two things were wrong before. (1) The finest grade was 208 cells across a
   * 512 bake — 2.5 texels, i.e. white noise, and the "grain" band on top of it
   * was 480 cells across 512, literally sub-texel. (2) The interstitial dust
   * was authored at 0.29 while the stone tops ran to 0.62 and then the runtime
   * cavity-grime layer pushed the (low) bed down another 17% toward black. A
   * 2.5:1 albedo step at a 10 mm period across the whole frame is the textbook
   * recipe for salt-and-pepper. So: three grades at 34/19/9 mm (5.9 texels at
   * the worst), stones separated from the bed by RELIEF and ROUGHNESS rather
   * than by value, and a bed sitting mid-height so the cavity term leaves it
   * alone.
   */
  vec4 a = owWorley(p * 5.5, P * 5.5, 1.0);
  vec4 b = owWorley(p * 10.0 + 5.0, P * 10.0, 1.0);
  vec4 cSm = owWorley(p * 21.0 + 11.0, P * 21.0, 1.0);

  // Sparse: most of what you see is the compacted bed, with stones IN it. The
  // old coverage was ~80% at every grade, which is a shingle beach; a used
  // road shows perhaps a quarter of its aggregate.
  float sA = smoothstep(0.36, 0.10, a.x) * step(0.44, a.w);
  float sB = smoothstep(0.30, 0.08, b.x) * step(0.62, b.w);
  float sC = smoothstep(0.24, 0.06, cSm.x) * step(0.74, cSm.w);

  // The stones live in the height field: raised relief so each one catches the
  // sun on one side and shadows on the other. Half-buried, not tipped out on
  // the surface — the peak-to-trough is only a few mm at world scale.
  float ha = sA * 0.15 * (0.5 + a.z);
  float hb = sB * 0.09 * (0.5 + b.z);
  float hc = sC * 0.025;
  h = 0.54 + (bed - 0.5) * 0.11 + max(max(ha, hb), hc) + 0.22 * (ha + hb);

  /**
   * The stone palette has to straddle the bed value, not sit above it. With
   * the bed at 0.35 and the stones running 0.29-0.51 every dark stone hid in
   * the dust and only the pale ones showed, which is why the road read as
   * white confetti scattered on grey rather than as aggregate. Half the
   * stones are now darker than the bed and half lighter.
   */
  vec3 s1 = owSRGB(vec3(0.372, 0.356, 0.332));
  vec3 s2 = owSRGB(vec3(0.232, 0.220, 0.208));
  vec3 s3 = owSRGB(vec3(0.462, 0.438, 0.400));
  vec3 s4 = owSRGB(vec3(0.352, 0.276, 0.220));
  vec3 top = mix(s1, s2, a.z);
  top = mix(top, s3, step(0.78, a.w));
  top = mix(top, s4, step(0.90, b.w) * 0.7);

  // The bed is dust, and it is only a few percent off the stones sitting in it.
  vec3 cBed = owSRGB(vec3(0.362, 0.336, 0.294));
  vec3 c = mix(cBed, top, clamp(sA * 0.70 + sB * 0.42 + sC * 0.16, 0.0, 1.0));
  // ~9 mm grain, 4.9 texels wide: a texture, not a dither.
  float grain = owFbm01(p * 13.0, P * 13.0, 4, 0.5);
  c *= 0.965 + 0.07 * grain;

  // Per-stone gloss: wet-worn pebbles glint, the dust between them does not.
  // This, not albedo, is what separates a stone from the dust around it.
  // Per-stone gloss, but only a little of it. Under a bright sky the IBL
  // specular lobe is a big part of what a shaded ground plane returns, so a
  // wide roughness spread at the aggregate period is another way of writing
  // salt-and-pepper: clamping this term alone took the measured
  // high-frequency deviation on the road from 2.45 to 1.68.
  rough = 0.82 + 0.05 * grain + (1.0 - clamp(sA + sB, 0.0, 1.0)) * 0.06
        - sA * (0.06 + 0.07 * a.z) - sB * 0.05 * b.z;
  metal = 0.0;
  /**
   * AO IS THE WHOLE BALLGAME ON A GROUND PLANE. A street in shadow is lit
   * almost entirely by the sky, so orm.r is very nearly the only shading
   * term the surface has — a 0.62:1.0 cavity ripple at the 10-30 mm aggregate
   * period is therefore a 1.6:1 luminance ripple at 2 screen pixels, which is
   * precisely the salt-and-pepper the critics measured. (Proved by clamping
   * the albedo to a constant and the normal map to flat: the speckle survived
   * both untouched, and only died when this range was compressed.) Baked
   * cavity AO belongs at low frequency and low contrast; the shading of an
   * individual stone is the normal map's job.
   */
  ao = mix(0.87, 1.0, smoothstep(0.42, 0.66, h));

  // fine dust filling the gaps
  float dust = 1.0 - smoothstep(0.44, 0.62, h);
  c = mix(c, cBed * 1.04, dust * 0.5);
  rough += dust * 0.08;
  ao = mix(ao, 1.0, dust * 0.3);

  // Wheel and foot traffic sweeps the loose grit into drifts and polishes bare
  // lanes: 0.5-1.5 m form inside the tile, which is the scale the eye uses to
  // decide whether a road is a surface or a pattern.
  float drift = owFbm01(owWarp(p * 0.9 + 17.0, P * 0.9, 0.8, 3), P * 0.9, 4, 0.6);
  h += (drift - 0.5) * 0.10;
  c *= 0.86 + 0.28 * drift;
  rough += (drift - 0.5) * 0.10;
  // Dust drifts BURY the aggregate: where the drift is deep the stones go
  // under it. Without this the stone density is identical over every square
  // metre of a hundred-metre street, which is the tell that it is a texture.
  c = mix(c, cBed * (0.92 + 0.22 * drift), smoothstep(0.55, 0.88, drift) * 0.72);

  // Dried tyre tracks and dragged-heel scuffs — long, shallow, low contrast.
  float scuff = owFbm01(owShear(p * 2.2, 0.0, 6.0), owShearPer(P * 2.2, 6.0), 4, 0.5);
  c *= 1.0 - smoothstep(0.55, 0.92, scuff) * 0.10;
  rough -= smoothstep(0.6, 0.95, scuff) * 0.08;

  alb = clamp(c, vec3(0.02), vec3(0.78));
  rough = clamp(rough, 0.62, 0.99);
  ao = clamp(ao, 0.72, 1.0);
  h = clamp(h, 0.0, 1.0);
}
`;
