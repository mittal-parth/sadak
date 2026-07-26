/**
 * Metals. The single most important physical rule here: bare metal is
 * metalness 1, and every oxide/paint/dirt layer on top of it is metalness 0.
 * Blending metalness through the rust and chip masks is what makes these read
 * as real steel rather than as grey plastic.
 */

/** Shared: layered iron oxide. Returns rust amount [0,1] and its colour. */
export const RUST_HELPERS = /* glsl */ `
vec3 owRustColour(float t, float grain){
  // young rust is orange, mature rust is dark red-brown, old rust is near-black
  vec3 c1 = owSRGB(vec3(0.560, 0.290, 0.110));   // fresh orange
  vec3 c2 = owSRGB(vec3(0.380, 0.180, 0.085));   // mid
  vec3 c3 = owSRGB(vec3(0.190, 0.100, 0.060));   // mature
  vec3 c4 = owSRGB(vec3(0.640, 0.400, 0.190));   // powdery bloom
  vec3 c = mix(c1, c2, smoothstep(0.15, 0.6, t));
  c = mix(c, c3, smoothstep(0.55, 1.0, t));
  c = mix(c, c4, smoothstep(0.55, 0.95, grain) * 0.45);
  return c * (0.82 + 0.36 * grain);
}
`;

export const METAL_RUST = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  vec2 p = uv * P + uSeed * 7.7;

  // ---- base steel ----
  float mill = owFbm01(owShear(p * 4.0, 1.0, 6.0), owShearPer(P * 4.0, 6.0), 4, 0.5);
  float fine = owFbm01(p * 22.0, P * 22.0, 4, 0.5);
  vec3 steel = owSRGB(vec3(0.330, 0.335, 0.345)) * (0.90 + 0.18 * mill);
  vec3 c = steel;
  h = 0.72 + (mill - 0.5) * 0.02 + (fine - 0.5) * 0.01;
  rough = 0.40 + (mill - 0.5) * 0.16 + (fine - 0.5) * 0.08;
  metal = 1.0;
  ao = 1.0;

  // ---- rust blooms: warped billow clusters, hard-edged where they flake ----
  vec2 wp = owWarp(p * 1.4, P * 1.4, 1.2, 4);
  float bloom = owBillow(wp, P * 1.4, 5, 0.6);
  bloom = 1.0 - bloom;                              // clusters, not veins
  float spread = owFbm01(p * 0.7 + 12.0, P * 0.7, 3, 0.6);
  float rust = smoothstep(0.36, 0.72, bloom * (0.55 + 0.85 * spread));
  float rustGrain = owFbm01(p * 26.0, P * 26.0, 4, 0.55);
  float pit = owFbm01(p * 24.0, P * 24.0, 3, 0.5);

  // flaking scale: the rust lifts in plates near the edge of a bloom
  float scale = owWorley(p * 16.0, P * 16.0, 1.0).x;
  float flake = smoothstep(0.30, 0.10, scale) * smoothstep(0.25, 0.55, rust) * (1.0 - smoothstep(0.8, 1.0, rust));

  // Rust *colour* is driven by how old the patch is, not by how much of it
  // there is — otherwise every heavily rusted area collapses to the same brown.
  float rustAge = owFbm01(p * 0.85 + 21.0, P * 0.85, 4, 0.62);
  vec3 rustCol = owRustColour(rustAge * 0.8 + rust * 0.3, rustGrain);
  c = mix(c, rustCol, rust);
  metal = mix(1.0, 0.0, smoothstep(0.15, 0.55, rust));
  rough = mix(rough, 0.86 + 0.10 * rustGrain, smoothstep(0.1, 0.6, rust));
  h += rust * 0.11 * (0.4 + rustGrain) + flake * 0.13;
  h -= smoothstep(0.5, 0.95, rust) * pit * 0.14;      // deep pitting under old rust
  ao -= flake * 0.30 + smoothstep(0.6, 1.0, rust) * 0.15;

  // ---- pitting straight into the steel where rust has eaten through ----
  vec4 pits = owWorley(p * 22.0, P * 22.0, 1.0);
  float deep = smoothstep(0.22, 0.0, pits.x) * step(0.72, pits.w) * smoothstep(0.3, 0.8, rust);
  h -= deep * 0.22;
  ao -= deep * 0.45;
  c = mix(c, rustCol * 0.35, deep * 0.7);

  // ---- scratches through everything, exposing bright metal ----
  float scr = owScratches(p * 3.0, P * 3.0, 12.0, 1.0, 0.60);
  scr += owScratches(p * 5.0 + 8.0, P * 5.0, 9.0, -2.0, 0.66) * 0.7;
  scr = clamp(scr, 0.0, 1.0) * 0.6;
  c = mix(c, owSRGB(vec3(0.480, 0.485, 0.495)), scr * 0.8);
  metal = mix(metal, 1.0, scr * 0.85);
  rough = mix(rough, 0.24, scr * 0.7);
  h -= scr * 0.010;

  // ---- grime ----
  float grime = smoothstep(0.55, 0.9, owFbm01(vec2(p.x * 5.0, p.y * 0.8), vec2(P.x * 5.0, max(P.y, 1.0)), 5, 0.55));
  c *= 1.0 - grime * 0.25;
  rough += grime * 0.08;

  alb = clamp(c, vec3(0.02), vec3(0.80));
  rough = clamp(rough, 0.12, 0.99);
  ao = clamp(ao, 0.15, 1.0);
  h = clamp(h, 0.0, 1.0);
}
`;

export const METAL_PAINTED = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  vec2 p = uv * P + uSeed * 11.3;

  // ---- substrate: steel with a mill finish ----
  float mill = owFbm01(owShear(p * 5.0, 1.0, 8.0), owShearPer(P * 5.0, 8.0), 4, 0.5);
  vec3 steel = owSRGB(vec3(0.330, 0.335, 0.345)) * (0.88 + 0.2 * mill);

  // ---- rust that has crept under the paint ----
  float bloom = 1.0 - owBillow(owWarp(p * 1.8, P * 1.8, 1.1, 4), P * 1.8, 5, 0.6);
  float rustField = smoothstep(0.60, 0.92, bloom);
  float rustGrain = owFbm01(p * 22.0, P * 22.0, 4, 0.55);
  vec3 rustCol = owRustColour(rustField, rustGrain);

  // ---- paint: an industrial coat with roller texture and orange peel ----
  float peel = owFbm01(p * 22.0, P * 22.0, 4, 0.5);
  float roller = owFbm01(owShear(p * 2.0, 0.0, 3.0), owShearPer(P * 2.0, 3.0), 4, 0.5);
  vec3 paint = uTintA * (0.90 + 0.16 * roller);
  paint *= 0.96 + 0.08 * peel;
  // sun-bleached on the up-facing halves
  float bleach = smoothstep(0.35, 0.85, owFbm01(p * 0.8, P * 0.8, 3, 0.6));
  paint = mix(paint, paint * 1.25 + 0.03, bleach * 0.5);

  // ---- chipping: paint fails at scratches, impacts and along its own edges ----
  float chipField = owFbm01(owWarp(p * 2.6 + 4.0, P * 2.6, 0.9, 3), P * 2.6, 5, 0.55);
  float chipEdge = owFbm01(p * 12.0, P * 12.0, 4, 0.5);
  // Paint mostly holds: only the top of the distribution actually fails, and
  // it fails hardest where rust is already lifting it from underneath.
  float chipSrc = chipField * 0.60 + chipEdge * 0.20 + rustField * 0.32 + uParam.z * 0.25;
  float chip = smoothstep(0.66, 0.92, chipSrc);
  // small impact chips scattered around
  vec4 dings = owWorley(p * 20.0, P * 20.0, 1.0);
  float ding = smoothstep(0.14, 0.03, dings.x) * step(0.88, dings.w);
  chip = clamp(chip + ding, 0.0, 1.0);

  // scratches that cut down to bare metal
  float scr = owScratches(p * 2.5, P * 2.5, 14.0, 1.0, 0.62);
  scr += owScratches(p * 4.0 + 21.0, P * 4.0, 10.0, -1.0, 0.66) * 0.8;
  scr = clamp(scr, 0.0, 1.0);

  // ---- layer stack: paint over primer over rust over steel ----
  vec3 primer = owSRGB(vec3(0.470, 0.300, 0.180));
  float primerBand = smoothstep(0.0, 0.35, chip) * (1.0 - smoothstep(0.35, 0.6, chip));

  vec3 c = paint;
  float r = 0.42 + (peel - 0.5) * 0.22 + bleach * 0.16;
  float mtl = 0.0;
  h = 0.74 + (roller - 0.5) * 0.02 + (peel - 0.5) * 0.012;
  ao = 1.0;

  c = mix(c, primer, primerBand * 0.7);
  c = mix(c, rustCol, smoothstep(0.35, 0.75, chip) * (0.55 + 0.45 * rustField));
  c = mix(c, steel, smoothstep(0.75, 0.95, chip) * (1.0 - rustField) * 0.9);
  r = mix(r, 0.88, smoothstep(0.3, 0.8, chip) * (0.4 + 0.6 * rustField));
  r = mix(r, 0.38, smoothstep(0.8, 1.0, chip) * (1.0 - rustField));
  mtl = mix(0.0, 1.0, smoothstep(0.78, 0.96, chip) * (1.0 - smoothstep(0.2, 0.7, rustField)));
  h -= smoothstep(0.4, 0.8, chip) * 0.16;     // paint has real thickness
  ao -= smoothstep(0.35, 0.7, chip) * 0.22;
  // the lip of a chip is a bright hard edge
  float lip = smoothstep(0.30, 0.42, chip) * (1.0 - smoothstep(0.42, 0.55, chip));
  c *= 1.0 + lip * 0.15;
  h += lip * 0.05;

  // scratches on top of everything
  c = mix(c, owSRGB(vec3(0.500, 0.505, 0.515)), scr * 0.55);
  mtl = mix(mtl, 1.0, scr * 0.6);
  r = mix(r, 0.26, scr * 0.55);

  // ---- dirt and rain streaks ----
  float streak = owFbm01(vec2(p.x * 6.0, p.y * 0.7), vec2(P.x * 6.0, max(P.y, 1.0)), 5, 0.55);
  float grime = smoothstep(0.52, 0.92, streak);
  c *= 1.0 - grime * 0.30;
  r += grime * 0.10;
  mtl *= 1.0 - grime * 0.5;
  // rust bleed running down from the chips
  float bleed = smoothstep(0.66, 0.95, streak) * smoothstep(0.2, 0.6, rustField);
  c = mix(c, owSRGB(vec3(0.360, 0.190, 0.090)), bleed * 0.45);

  float cavity = 1.0 - smoothstep(0.62, 0.78, h);
  c *= 1.0 - cavity * 0.18;

  alb = clamp(c, vec3(0.02), vec3(0.85));
  rough = clamp(r, 0.14, 0.99);
  metal = clamp(mtl, 0.0, 1.0);
  ao = clamp(ao, 0.2, 1.0);
  h = clamp(h, 0.0, 1.0);
}
`;

export const METAL_BRUSHED = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  vec2 p = uv * P + uSeed * 15.1;

  // brushing runs along X: heavy shear so the noise stretches into fibres
  vec2 bp = owShear(p, 0.0, 64.0);
  vec2 BP = owShearPer(P, 64.0);
  float brush1 = owFbm01(bp * 2.0, BP * 2.0, 4, 0.5);
  float brush2 = owFbm01(bp * 8.0 + 3.0, BP * 8.0, 3, 0.5);
  float brush3 = owFbm01(owShear(p * 4.0, 0.0, 24.0), owShearPer(P * 4.0, 24.0), 3, 0.5);
  float brush = brush1 * 0.5 + brush2 * 0.32 + brush3 * 0.18;

  float macro = owFbm01(p * 0.9, P * 0.9, 3, 0.6);

  vec3 c = owSRGB(vec3(0.560, 0.565, 0.575));
  c *= 0.93 + 0.13 * brush;
  c *= 0.97 + 0.06 * macro;

  metal = 1.0;
  rough = 0.22 + brush * 0.24 + (macro - 0.5) * 0.06;
  h = 0.78 + (brush - 0.5) * 0.012;
  ao = 1.0;

  // deeper score lines
  float score = owScratches(p * 1.0, P, 40.0, 0.0, 0.60);
  rough += score * 0.22;
  h -= score * 0.006;
  c *= 1.0 - score * 0.05;

  // cross scratches from handling
  float cross = owScratches(p * 3.0, P * 3.0, 8.0, 3.0, 0.70) * 0.7;
  rough += cross * 0.20;
  h -= cross * 0.004;

  // dents: shallow, wide, they break the reflection
  float dent = owFbm01(p * 3.0 + 7.0, P * 3.0, 3, 0.6);
  h += (dent - 0.5) * 0.05;

  // fingerprints and grease smudges — the thing that sells brushed metal
  float smudge = smoothstep(0.58, 0.86, owFbm01(owWarp(p * 2.2 + 19.0, P * 2.2, 0.7, 3), P * 2.2, 4, 0.55));
  rough += smudge * 0.22;
  c *= 1.0 - smudge * 0.06;
  metal -= smudge * 0.10;

  // grime settling in
  float grime = smoothstep(0.66, 0.95, owFbm01(p * 5.0, P * 5.0, 4, 0.55));
  c = mix(c, owSRGB(vec3(0.180, 0.175, 0.165)), grime * 0.35);
  rough += grime * 0.18;
  metal -= grime * 0.35;

  alb = clamp(c, vec3(0.02), vec3(0.88));
  rough = clamp(rough, 0.08, 0.95);
  metal = clamp(metal, 0.0, 1.0);
  ao = clamp(ao, 0.4, 1.0);
  h = clamp(h, 0.0, 1.0);
}
`;

export const CORRUGATED = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  const float RIDGES = 12.0;
  vec2 p = uv * P + uSeed * 6.1;

  // ---- the profile: sinusoidal ridges with a flat-ish crown ----
  float t = uv.x * RIDGES * 6.28318530718;
  float wave = sin(t);
  float profile = sign(wave) * pow(abs(wave), 0.72) * 0.5 + 0.5;
  // panel joints every 4 ridges: one sheet laps over the next
  float panel = uv.x * RIDGES / 4.0;
  float panelId = floor(panel);
  float lap = smoothstep(0.0, 0.06, fract(panel)) * smoothstep(0.0, 0.06, 1.0 - fract(panel));
  float panelStep = (owHash11(panelId + uSeed) - 0.5) * 0.05;

  float dents = owFbm01(p * 2.2, P * 2.2, 4, 0.6);
  float fine = owFbm01(p * 11.0, P * 11.0, 4, 0.5);

  h = 0.18 + profile * 0.62 + panelStep + (dents - 0.5) * 0.07 + (fine - 0.5) * 0.012;
  h -= (1.0 - lap) * 0.06;

  // ---- galvanised zinc: crystalline spangle ----
  vec4 sp = owWorley(p * 7.0, P * 7.0, 1.0);
  float spangle = smoothstep(0.55, 0.05, sp.x);
  vec3 zinc = owSRGB(vec3(0.520, 0.535, 0.545));
  vec3 c = mix(zinc * 0.86, zinc * 1.12, spangle * (0.3 + 0.7 * sp.z));
  c *= 0.94 + 0.12 * fine;
  metal = 1.0;
  rough = 0.34 + (1.0 - spangle) * 0.16 + (fine - 0.5) * 0.08;
  ao = 1.0;

  // ---- rust, heavier in the valleys and at the bottom of the sheet ----
  float valley = 1.0 - profile;
  float rustField = smoothstep(0.62, 0.98,
      (1.0 - owBillow(owWarp(p * 1.6, P * 1.6, 1.0, 4), P * 1.6, 5, 0.6)) *
      (0.58 + 0.40 * valley) + (1.0 - uv.y) * 0.16);
  float rustGrain = owFbm01(p * 22.0, P * 22.0, 4, 0.55);
  vec3 rustCol = owRustColour(rustField, rustGrain);
  c = mix(c, rustCol, rustField);
  metal = mix(metal, 0.0, smoothstep(0.15, 0.6, rustField));
  rough = mix(rough, 0.88 + 0.08 * rustGrain, smoothstep(0.1, 0.6, rustField));
  h += rustField * 0.02 * rustGrain;

  // holes rusted right through
  vec4 hole = owWorley(p * 5.0 + 31.0, P * 5.0, 0.95);
  float perf = smoothstep(0.10, 0.02, hole.x) * step(0.94, hole.w) * smoothstep(0.5, 0.9, rustField);
  h -= perf * 0.5;
  ao -= perf * 0.7;
  c = mix(c, rustCol * 0.25, perf);

  // ---- fixings: hex screws with a rubber washer, two rows, on the crowns ----
  float crown = smoothstep(0.72, 0.95, profile);
  vec2 fx = vec2(fract(uv.x * RIDGES) - 0.5, fract(uv.y * 3.0) - 0.5);
  float fd = length(fx * vec2(1.0, RIDGES / 3.0));
  float screwRnd = owHash12(floor(vec2(uv.x * RIDGES, uv.y * 3.0)) + uSeed);
  float screw = smoothstep(0.16, 0.11, fd) * crown * step(0.25, screwRnd);
  float washer = smoothstep(0.24, 0.18, fd) * crown * step(0.25, screwRnd);
  h += washer * 0.02 + screw * 0.035;
  c = mix(c, owSRGB(vec3(0.120, 0.115, 0.110)), washer * 0.8);
  c = mix(c, mix(owSRGB(vec3(0.400, 0.405, 0.410)), rustCol, rustField), screw);
  rough = mix(rough, 0.85, washer * 0.8);
  rough = mix(rough, 0.42 + rustField * 0.4, screw);
  metal = mix(metal, 0.0, washer * 0.9);
  metal = mix(metal, 1.0 - rustField, screw);
  ao -= (washer - screw) * 0.35;
  // rust streak weeping from each fixing
  float weep = washer * 0.0 + smoothstep(0.34, 0.20, fd) * step(0.25, screwRnd) * crown *
               smoothstep(0.0, 0.5, fract(uv.y * 3.0) - 0.5);
  c = mix(c, owSRGB(vec3(0.330, 0.170, 0.080)), clamp(weep, 0.0, 1.0) * 0.5);

  // ---- dirt collecting in the valleys ----
  float dirt = valley * smoothstep(0.35, 0.8, owFbm01(p * 3.0, P * 3.0, 4, 0.55));
  c = mix(c, owSRGB(vec3(0.200, 0.185, 0.160)), dirt * 0.40);
  rough += dirt * 0.14;
  metal *= 1.0 - dirt * 0.5;
  ao -= valley * 0.18;

  alb = clamp(c, vec3(0.02), vec3(0.85));
  rough = clamp(rough, 0.14, 0.99);
  metal = clamp(metal, 0.0, 1.0);
  ao = clamp(ao, 0.15, 1.0);
  h = clamp(h, 0.0, 1.0);
}
`;
