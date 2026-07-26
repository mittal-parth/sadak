/**
 * Wood, fabric, sandbag/burlap, foliage, rubber, glass.
 * Foliage writes its cutout mask into the height channel's companion — see
 * generator.js, which routes `h` to albedo.a for parallax on most surfaces but
 * to the alpha-test mask for `foliage`.
 */

export const WOOD = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  const float PLANKS = 5.0;
  vec2 p = uv * P + uSeed * 12.9;

  // ---- plank layout: rows running along X, staggered butt joints ----
  float rowF = uv.y * PLANKS;
  float row = floor(rowF);
  float rf = fract(rowF);
  float stagger = owHash11(row + uSeed * 2.0);
  float lenF = uv.x * 2.0 + stagger;             // 2 boards per row lengthwise
  float board = floor(lenF);
  float lf = fract(lenF);
  vec4 rnd = owHash42(vec2(board, row) + uSeed);

  // gaps between boards
  const float GY = 0.035, GX = 0.010;
  float ey = min(smoothstep(0.0, GY, rf), smoothstep(0.0, GY, 1.0 - rf));
  float ex = min(smoothstep(0.0, GX, lf), smoothstep(0.0, GX, 1.0 - lf));
  float face = min(ex, ey);

  // ---- grain: rings stretched along the board, warped, with knots ----
  vec2 gp = vec2(lf * 2.0 + rnd.x * 13.0, rf + rnd.y * 7.0);
  vec2 GP = vec2(16.0, 8.0);
  float warp = owFbm(vec2(gp.x * 3.0, gp.y * 12.0), vec2(GP.x * 3.0, GP.y * 12.0), 4, 0.55);
  float ringCoord = gp.y * (14.0 + rnd.z * 12.0) + warp * 2.2 + rnd.w * 5.0;

  // knots pull the rings into a tight radial swirl
  vec2 knotP = vec2(0.25 + rnd.x * 0.5, 0.35 + rnd.y * 0.3);
  float kd = length((vec2(lf, rf) - knotP) * vec2(2.2, 1.0));
  float hasKnot = step(0.68, rnd.z);
  float knotPull = hasKnot * exp(-kd * 9.0);
  ringCoord = mix(ringCoord, kd * 42.0, clamp(knotPull * 1.6, 0.0, 1.0));

  float rings = fract(ringCoord);
  float ringDark = smoothstep(0.42, 0.5, rings) * (1.0 - smoothstep(0.5, 0.62, rings));
  float latewood = smoothstep(0.30, 0.52, rings);

  // fine fibre along the grain
  float fibre = owFbm01(owShear(p * 6.0, 0.0, 40.0), owShearPer(P * 6.0, 40.0), 4, 0.5);
  float micro = owFbm01(p * 22.0, P * 22.0, 3, 0.5);

  // ---- colour ----
  vec3 wLight = owSRGB(vec3(0.505, 0.408, 0.290));
  vec3 wMid   = owSRGB(vec3(0.362, 0.272, 0.180));
  vec3 wDark  = owSRGB(vec3(0.205, 0.142, 0.092));
  vec3 wGrey  = owSRGB(vec3(0.372, 0.355, 0.328));   // weathered silver-grey
  vec3 c = mix(wLight, wMid, rnd.w * 0.8 + latewood * 0.5);
  c = mix(c, wDark, ringDark * 0.65);
  c *= 0.90 + 0.18 * fibre;
  c = mix(c, wDark * 0.7, clamp(knotPull * 2.2, 0.0, 1.0) * 0.8);

  // weathering: UV-bleached, silvered, worst on the exposed boards
  float weather = smoothstep(0.20, 0.85, owFbm01(p * 0.8, P * 0.8, 3, 0.6)) * (0.4 + 0.6 * rnd.x);
  c = mix(c, wGrey, weather * 0.68);

  float faceH = 0.74 - ringDark * 0.02 - latewood * 0.012 + (fibre - 0.5) * 0.03 + (micro - 0.5) * 0.008;
  faceH += (rnd.y - 0.5) * 0.035;              // boards cup and sit at different heights
  faceH -= clamp(knotPull * 1.5, 0.0, 1.0) * 0.03;

  // splits and checks running along the grain
  float split = owScratches(vec2(p.x, p.y) * 2.0, P * 2.0, 30.0, 0.0, 0.66) * weather;
  faceH -= split * 0.10;
  c = mix(c, wDark * 0.45, split * 0.7);

  // saw marks across the board
  float saw = owFbm01(owShear(p * 3.0, 0.0, 1.0) * vec2(30.0, 1.0), vec2(P.x * 90.0, P.y * 3.0), 3, 0.5);
  faceH += (saw - 0.5) * 0.012;

  // rounded / bashed board edges
  float edgeD = min(min(rf, 1.0 - rf) / GY, min(lf, 1.0 - lf) / GX);
  float bevel = 1.0 - smoothstep(0.0, 2.4, edgeD);
  faceH -= bevel * 0.035;
  c *= 1.0 - bevel * 0.10;
  c = mix(c, wLight * 1.15, bevel * smoothstep(0.5, 0.9, owFbm01(p * 20.0, P * 20.0, 3, 0.5)) * 0.35);

  // ---- gap between boards: dark, deep ----
  float m = smoothstep(0.05, 0.7, face);
  h = mix(0.44, faceH, m);
  c = mix(wDark * 0.25, c, m);
  rough = mix(0.95, 0.62 + 0.22 * fibre + weather * 0.20 + split * 0.15, m);
  ao = mix(0.25, 1.0, smoothstep(0.0, 0.5, face)) - bevel * 0.12 * m;
  metal = 0.0;

  // ---- nails ----
  vec2 nf = vec2(fract(lf * 3.0 + 0.5) - 0.5, (rf - 0.5));
  float nd = length(nf * vec2(3.0, 1.0) / vec2(3.0, 1.0) * vec2(1.0, 1.0));
  nd = length(vec2(fract(lf * 3.0 + 0.5) - 0.5, rf - 0.22) * vec2(1.4, 1.0));
  float nail = smoothstep(0.055, 0.030, nd) * m * step(0.3, rnd.w);
  h -= nail * 0.02;
  c = mix(c, owSRGB(vec3(0.230, 0.200, 0.170)), nail * 0.85);
  rough = mix(rough, 0.55, nail);
  metal = mix(metal, 0.85, nail * 0.7);
  ao -= nail * 0.25;
  // rust weep under the nail
  float weep = smoothstep(0.11, 0.05, nd) * step(0.3, rnd.w) * smoothstep(0.0, 0.6, rf - 0.22) * m;
  c = mix(c, owSRGB(vec3(0.330, 0.185, 0.095)), clamp(weep, 0.0, 1.0) * 0.4);

  // grime
  float cavity = 1.0 - smoothstep(0.55, 0.78, h);
  c = mix(c, owSRGB(vec3(0.120, 0.106, 0.088)), cavity * 0.45);
  // ground-in dirt over the whole board
  float soil = smoothstep(0.40, 0.88, owFbm01(owWarp(p * 2.2 + 5.0, P * 2.2, 0.9, 3), P * 2.2, 5, 0.6));
  c = mix(c, owSRGB(vec3(0.185, 0.160, 0.128)), soil * 0.40);
  rough += soil * 0.08;

  alb = clamp(c, vec3(0.02), vec3(0.80));
  rough = clamp(rough, 0.25, 0.99);
  ao = clamp(ao, 0.12, 1.0);
  h = clamp(h, 0.0, 1.0);
}
`;

export const FABRIC = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  const float THREADS = 96.0;
  vec2 p = uv * P + uSeed * 3.9;

  // ---- plain weave: warp over weft on alternating cells ----
  vec2 t = uv * THREADS;
  vec2 cell = floor(t);
  vec2 f = fract(t) - 0.5;
  float over = mod(cell.x + cell.y, 2.0);   // 0 -> warp on top, 1 -> weft on top

  float warpProfile = cos(f.x * 3.14159) ;
  float weftProfile = cos(f.y * 3.14159);
  float top = mix(warpProfile, weftProfile, over);
  float bot = mix(weftProfile, warpProfile, over) * 0.45;
  float weave = max(top, bot);
  float threadId = owHash12(cell + uSeed);

  // ---- fuzz and slubs ----
  float fuzz = owFbm01(p * 12.0, P * 12.0, 3, 0.55);
  float slub = owFbm01(p * 14.0, P * 14.0, 4, 0.5);
  float macro = owFbm01(p * 1.2, P * 1.2, 4, 0.6);

  vec3 cA = uTintA;
  vec3 cB = uTintB;
  vec3 c = mix(cA, cB, threadId * 0.6 + slub * 0.4);
  c *= 0.865 + 0.215 * (weave * 0.5 + 0.5);
  c *= 0.960 + 0.075 * fuzz;
  c *= 0.90 + 0.20 * macro;

  h = 0.55 + weave * 0.30 + (fuzz - 0.5) * 0.03 + (slub - 0.5) * 0.05;
  rough = 0.86 + (1.0 - weave) * 0.08 + (fuzz - 0.5) * 0.06;
  metal = 0.0;
  ao = mix(0.82, 1.0, smoothstep(-0.4, 0.9, weave));

  // ---- drape folds ---------------------------------------------------------
  // Cloth under tension gathers into soft parallel ridges roughly a hand's width
  // apart, wandering as they run. At the 0.26 m mapping the awnings use, 2.6
  // cycles across the tile is a ~10 cm fold. A weave alone reads as printed
  // canvas; the fold field is what gives a canopy its shape between its poles.
  float foldC = uv.y * 2.6 + uv.x * 0.55 + owFbm01(p * 0.9, P * 0.9, 3, 0.62) * 2.2;
  float foldT = abs(fract(foldC) - 0.5) * 2.0;          // 0 at crest, 1 in trough
  float crest = 1.0 - foldT;
  float foldR = owHash11(floor(foldC) * 2.13 + uSeed);
  float fold = crest * crest * (0.55 + 0.75 * foldR);
  h += (fold - 0.30) * 0.115;
  c *= 0.895 + 0.21 * fold;
  ao -= (1.0 - crest) * 0.14;
  // the crease line itself is polished by handling and holds the dust
  float creaseLine = 1.0 - smoothstep(0.0, 0.10, foldT);
  rough -= creaseLine * 0.06;
  c *= 1.0 + creaseLine * 0.05;

  // ---- wear: threadbare patches, fraying, pulled threads ----
  float wearField = smoothstep(0.58, 0.82, owFbm01(owWarp(p * 2.0, P * 2.0, 0.8, 3), P * 2.0, 4, 0.55));
  c = mix(c, c * 1.35 + 0.02, wearField * 0.5);
  rough += wearField * 0.06;
  h -= wearField * 0.05;

  float pulled = owScratches(p * 3.0, P * 3.0, 18.0, 1.0, 0.68);
  h += pulled * 0.05;
  c *= 1.0 - pulled * 0.10;

  // ---- stains and dust ----
  float stain = smoothstep(0.55, 0.9, owFbm01(owWarp(p * 1.5 + 7.0, P * 1.5, 1.0, 3), P * 1.5, 5, 0.6));
  c = mix(c, c * 0.42 + owSRGB(vec3(0.09, 0.08, 0.06)), stain * 0.55);
  rough += stain * 0.05;

  float dust = smoothstep(0.4, 0.85, owFbm01(p * 6.0, P * 6.0, 4, 0.5));
  c = mix(c, owSRGB(vec3(0.400, 0.375, 0.335)), dust * 0.14);

  alb = clamp(c, vec3(0.02), vec3(0.85));
  rough = clamp(rough, 0.5, 0.99);
  ao = clamp(ao, 0.25, 1.0);
  h = clamp(h, 0.0, 1.0);
}
`;

export const BURLAP = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  const float THREADS = 34.0;      // hessian is coarse
  vec2 p = uv * P + uSeed * 4.7;

  vec2 t = uv * THREADS;
  vec2 cell = floor(t);
  vec2 f = fract(t) - 0.5;
  float over = mod(cell.x + cell.y, 2.0);

  // hessian threads are irregular: each one has its own thickness
  float twx = 0.62 + 0.30 * owHash12(vec2(cell.x, 0.0) + uSeed);
  float twy = 0.62 + 0.30 * owHash12(vec2(0.0, cell.y) + uSeed * 1.7);
  float warpP = cos(clamp(f.x / twx, -0.5, 0.5) * 3.14159);
  float weftP = cos(clamp(f.y / twy, -0.5, 0.5) * 3.14159);
  float top = mix(warpP, weftP, over);
  float bot = mix(weftP, warpP, over) * 0.40;
  float weave = max(top, bot);

  float fibre = owFbm01(owShear(p * 12.0, 0.0, 8.0), owShearPer(P * 12.0, 8.0), 3, 0.5);
  float macro = owFbm01(p * 1.0, P * 1.0, 4, 0.62);
  float dirt  = owFbm01(owWarp(p * 2.5, P * 2.5, 0.8, 3), P * 2.5, 5, 0.55);

  vec3 cJute = owSRGB(vec3(0.520, 0.430, 0.275));
  vec3 cPale = owSRGB(vec3(0.640, 0.560, 0.400));
  vec3 cSoil = owSRGB(vec3(0.230, 0.180, 0.120));
  vec3 c = mix(cJute, cPale, owHash12(cell + 3.0) * 0.5 + fibre * 0.15);
  c *= 0.855 + 0.235 * (weave * 0.5 + 0.5);
  c *= 0.90 + 0.18 * macro;
  c = mix(c, cSoil, smoothstep(0.42, 0.85, dirt) * 0.60);

  h = 0.50 + weave * 0.38 + (fibre - 0.5) * 0.05;
  rough = 0.90 + (1.0 - weave) * 0.06;
  metal = 0.0;
  ao = mix(0.74, 1.0, smoothstep(-0.4, 0.9, weave));

  // sun rot: bleached and frayed on the exposed side
  float rot = smoothstep(0.55, 0.9, owFbm01(p * 0.7 + 11.0, P * 0.7, 3, 0.6));
  c = mix(c, cPale * 1.15, rot * 0.4);
  rough += rot * 0.05;

  // loose fibres standing off the surface
  float loose = owScratches(p * 4.0, P * 4.0, 10.0, 2.0, 0.70);
  h += loose * 0.06;
  c = mix(c, cPale, loose * 0.3);

  // spilled sand caught in the weave
  float sand = smoothstep(0.5, 0.85, owFbm01(p * 12.0, P * 12.0, 4, 0.5)) * (1.0 - smoothstep(0.2, 0.7, weave));
  c = mix(c, owSRGB(vec3(0.640, 0.545, 0.390)), sand * 0.45);

  alb = clamp(c, vec3(0.02), vec3(0.80));
  rough = clamp(rough, 0.6, 0.99);
  ao = clamp(ao, 0.2, 1.0);
  h = clamp(h, 0.0, 1.0);
}
`;

export const FOLIAGE = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  const float CELLS = 5.0;
  vec2 p = uv * P + uSeed * 5.9;

  // Each cell holds one leaf, rotated and scaled by its hash. Sampling the
  // 3x3 neighbourhood lets leaves overlap into their neighbours' cells.
  vec2 lp = uv * CELLS;
  vec2 ip = floor(lp), fp = fract(lp);

  float bestCover = 0.0;
  float bestDepth = -1.0;
  vec3 bestCol = vec3(0.0);
  float bestH = 0.0;
  float bestVein = 0.0;

  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 g = vec2(float(x), float(y));
      vec2 cell = mod(ip + g, vec2(CELLS));
      vec4 r = owHash42(cell + uSeed * 2.0);
      vec4 r2 = owHash42(cell * 1.7 + 9.0 + uSeed);
      vec2 centre = g + 0.15 + r.xy * 0.7 - fp;
      float ang = r.z * 6.28318;
      vec2 q = owRot(centre, ang);
      // leaf shape: an ellipse pinched at both ends
      vec2 s = vec2(0.30 + r.w * 0.16, 0.13 + r2.x * 0.07);
      vec2 e = q / s;
      float d = length(e);
      float pinch = 1.0 - 0.55 * abs(e.x) * 0.5;
      float cover = smoothstep(1.02, 0.86, d / max(pinch, 0.3));
      // serrated edge
      float serr = sin(atan(e.y, e.x) * 26.0) * 0.03;
      cover = smoothstep(1.02 + serr, 0.88 + serr, d / max(pinch, 0.3));
      if (cover > 0.01){
        float depth = r2.y;
        if (depth > bestDepth){
          float vein = 1.0 - smoothstep(0.0, 0.05, abs(e.y * s.y));
          float sideV = smoothstep(0.75, 1.0, abs(fract(e.x * 5.0 + e.y * 2.0) * 2.0 - 1.0));
          vein = clamp(vein + sideV * 0.45 * cover, 0.0, 1.0);
          vec3 cYoung = owSRGB(vec3(0.180, 0.330, 0.090));
          vec3 cOld   = owSRGB(vec3(0.095, 0.185, 0.060));
          vec3 cDry   = owSRGB(vec3(0.390, 0.320, 0.110));
          vec3 lc = mix(cYoung, cOld, r2.z);
          lc = mix(lc, cDry, smoothstep(0.55, 1.0, r2.w) * 0.8);
          // blotches and mildew spots
          float spots = owFbm01(p * 22.0, P * 22.0, 3, 0.5);
          lc *= 0.85 + 0.30 * spots;
          lc = mix(lc, cDry * 0.7, smoothstep(0.78, 0.95, spots) * 0.5);
          lc = mix(lc, lc * 1.35, vein * 0.5);
          bestDepth = depth;
          bestCover = cover;
          bestCol = lc;
          bestH = 0.45 + depth * 0.35 + (1.0 - smoothstep(0.0, 1.0, d)) * 0.12 + vein * 0.05;
          bestVein = vein;
        }
      }
    }
  }

  float fine = owFbm01(p * 12.0, P * 12.0, 3, 0.5);
  alb = clamp(bestCol * (0.955 + 0.085 * fine), vec3(0.02), vec3(0.7));
  // h doubles as the cutout mask for foliage (see generator.js)
  h = bestCover;
  rough = clamp(0.62 + (1.0 - bestVein) * 0.14 + (fine - 0.5) * 0.10, 0.35, 0.95);
  metal = 0.0;
  ao = clamp(0.55 + bestDepth * 0.45, 0.3, 1.0);
}
`;

export const RUBBER = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  vec2 p = uv * P + uSeed * 9.6;

  // moulded pebble grain
  vec4 pb = owWorley(p * 12.0, P * 12.0, 1.0);
  float pebble = smoothstep(0.42, 0.10, pb.x);
  float fine = owFbm01(p * 12.0, P * 12.0, 3, 0.5);
  float macro = owFbm01(p * 1.5, P * 1.5, 4, 0.6);

  h = 0.60 + pebble * 0.10 + (fine - 0.5) * 0.02 + (macro - 0.5) * 0.03;
  // 0.20 sRGB ~= 0.031 linear. Anything darker lands under the 0.02 albedo
  // floor applied below, which clamps the entire surface flat (a black,
  // detail-free rubber that violates the "no flat surfaces" bar).
  vec3 c = owSRGB(vec3(0.200, 0.200, 0.206));
  c *= 0.85 + 0.25 * (pebble * 0.5 + 0.5);
  c *= 0.94 + 0.10 * fine;

  rough = 0.88 - pebble * 0.06 + (fine - 0.5) * 0.08;
  metal = 0.0;
  ao = mix(0.6, 1.0, pebble * 0.5 + 0.5);

  // mould seam
  float seam = 1.0 - smoothstep(0.0, 0.012, abs(fract(uv.y * 2.0 + 0.5) - 0.5));
  h += seam * 0.03;
  c *= 1.0 + seam * 0.35;
  rough -= seam * 0.10;

  // scuffs: rubber goes chalky-grey where it abrades
  float scuff = smoothstep(0.55, 0.88, owFbm01(owWarp(p * 3.0, P * 3.0, 0.8, 3), P * 3.0, 4, 0.55));
  c = mix(c, owSRGB(vec3(0.220, 0.218, 0.212)), scuff * 0.45);
  rough += scuff * 0.06;
  h -= scuff * 0.015;

  // cracking from ozone / age
  float crack = owCracks(p * 7.0, P * 7.0, 0.9, 0.028, 0.62);
  h -= crack * 0.06;
  c *= 1.0 - crack * 0.35;
  ao -= crack * 0.35;

  // dust
  float dust = smoothstep(0.5, 0.9, owFbm01(p * 8.0, P * 8.0, 4, 0.5));
  c = mix(c, owSRGB(vec3(0.290, 0.275, 0.250)), dust * 0.16);

  alb = clamp(c, vec3(0.02), vec3(0.35));
  rough = clamp(rough, 0.55, 0.99);
  ao = clamp(ao, 0.3, 1.0);
  h = clamp(h, 0.0, 1.0);
}
`;

export const GLASS = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  vec2 p = uv * P + uSeed * 2.2;

  float smear = owFbm01(owShear(p * 3.0, 1.0, 6.0), owShearPer(P * 3.0, 6.0), 4, 0.5);
  float dustF = owFbm01(p * 5.0, P * 5.0, 5, 0.55);
  float spots = owWorley(p * 24.0, P * 24.0, 1.0).x;
  float fine = owFbm01(p * 12.0, P * 12.0, 3, 0.5);

  // glass itself is almost black in albedo; the look comes from reflections
  vec3 c = owSRGB(vec3(0.045, 0.050, 0.052));

  float dirty = smoothstep(0.45, 0.85, dustF);
  c = mix(c, owSRGB(vec3(0.300, 0.290, 0.265)), dirty * 0.35);

  rough = 0.045 + smear * 0.10 * smoothstep(0.3, 0.9, dustF) + dirty * 0.22;
  rough += smoothstep(0.30, 0.05, spots) * 0.25;             // water spots
  rough += (fine - 0.5) * 0.02;

  // fine scratches
  float scr = owScratches(p * 2.0, P * 2.0, 24.0, 1.0, 0.70);
  rough += scr * 0.25;
  c += scr * 0.02;

  h = 0.5 + (smear - 0.5) * 0.004;
  metal = 0.0;
  ao = 1.0 - dirty * 0.1;

  alb = clamp(c, vec3(0.02), vec3(0.5));
  rough = clamp(rough, 0.02, 0.7);
  h = clamp(h, 0.0, 1.0);
}
`;
