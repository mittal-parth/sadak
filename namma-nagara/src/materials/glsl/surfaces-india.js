/**
 * Indian street surfaces: woven polyethylene tarpaulin, painted cement plaster
 * with peeling and chalking, and damp algae-colonised concrete.
 *
 * These three carry most of the load in flipping a street's read from Levantine
 * to Indian. The reasoning, since it is not obvious:
 *
 *  - TARPAULIN. The blue poly tarp is the single most India-signalling material
 *    there is — it roofs every stall, covers every load, patches every leak. It
 *    is also genuinely absent from the existing library: the closest surfaces
 *    are FABRIC (woven natural fibre, matte, no sheen) and BURLAP (coarse jute).
 *    A tarp is extruded plastic tape, so it is flat-woven, slightly glossy,
 *    saturated, and it creases rather than drapes.
 *
 *  - PLASTER_PAINTED. Distemper/emulsion over cement render, chalked by sun and
 *    peeling in sheets off the damp patches. Tinted from `uTintA` so one bake
 *    serves every wall colour on the street.
 *
 *  - MOSS_CONCRETE. Bengaluru gets ~970 mm of rain a year and everything grows.
 *    Algae colonises the cavities and the north faces of concrete; that green-black
 *    bloom in the crevices is what makes concrete read as tropical rather than
 *    desert.
 *
 * NOT baked here: the vertical monsoon streaking below every ledge. `shader.js`
 * already generates world-Y-driven rain runoff (`owWeatherP.y`), ground splash
 * and the wall/ground dust wedge, all keyed to a configurable grime colour — so
 * the streaks belong in the palette entry's `weather` and `grimeColor`, not in
 * the tile. Baking them in would fight the shader and break under triplanar.
 */

// ============================================================== tarpaulin ==
export const TARPAULIN = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  vec2 p = uv * P + uSeed * 7.31;

  // ---- woven tape -------------------------------------------------------
  // Woven polyethylene: flat tape ~3 mm wide, plain over-under weave. On a
  // 0.5 m tile that is 160 tapes each way, ~6 px at 1024 — about the finest
  // structure worth resolving before it aliases.
  const float N = 160.0;
  vec2 w = uv * N;
  float wx = fract(w.x), wy = fract(w.y);
  float over = mod(floor(w.x) + floor(w.y), 2.0);   // 0 = weft on top

  // Cross-section is a flattened bulge, not a cylinder — it is tape, not yarn.
  float bx = pow(max(sin(wx * 3.14159265), 0.0), 0.62);
  float by = pow(max(sin(wy * 3.14159265), 0.0), 0.62);
  float top = mix(by, bx, over);
  float bot = mix(bx, by, over);
  float weave = top * 0.76 + bot * 0.18;
  // The tiny square hole where four tapes meet — this is what stops a tarp
  // reading as a painted sheet.
  float hole = (1.0 - bx) * (1.0 - by);
  weave -= hole * 0.30;

  // ---- creases ----------------------------------------------------------
  // A tarp lives folded in a heap. Two scales: hard fold lines that survive
  // being spread out, and a soft crumple over the top.
  vec2 fq = owWarp(p * 0.85, P * 0.85, 0.55, 3);
  float folds = owRidged(fq, P * 0.85, 3, 0.55);
  folds = smoothstep(0.42, 0.95, folds);
  float crumple = owFbm(p * 2.3, P * 2.3, 4, 0.52);
  float sag = owFbm(p * 0.6, P * 0.6, 3, 0.6);

  float relief = weave * 0.30 + crumple * 0.16 + sag * 0.24 - folds * 0.22;
  h = clamp(0.55 + relief, 0.0, 1.0);

  // ---- colour -----------------------------------------------------------
  // uTintA is the tarp colour (the classic saturated blue, or orange/green).
  // Poly tarp is dyed through, so the tape colour is uniform and the variation
  // is all UV fade and dirt, not pigment.
  vec3 base = uTintA;
  // Alternating tapes catch the light differently and were extruded in
  // different batches — a subtle two-tone that reads as woven at 2 m.
  base *= 0.94 + 0.10 * over;
  base *= 0.90 + 0.16 * top;

  // UV fade: the sun bleaches the crease ridges and the broad exposed faces,
  // pulling saturation out toward a chalky version of the same hue.
  float exposure = smoothstep(0.35, 0.9, sag * 0.5 + 0.5) * 0.6 + folds * 0.55;
  float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  vec3 faded = mix(base, vec3(lum) * 1.35 + 0.06, 0.62);
  base = mix(base, faded, clamp(exposure, 0.0, 1.0) * 0.55);

  // Dirt settles into the fold troughs and the weave holes.
  float dirtField = owFbm01(owWarp(p * 1.6 + 13.0, P * 1.6, 0.7, 3), P * 1.6, 4, 0.55);
  float trough = 1.0 - smoothstep(0.30, 0.70, h);
  float dirt = clamp(trough * 0.85 + hole * 0.5, 0.0, 1.0) * (0.35 + 0.65 * dirtField);
  base = mix(base, owSRGB(vec3(0.150, 0.132, 0.106)), dirt * 0.42);

  // ---- wear -------------------------------------------------------------
  // Tarps fail at the creases: the tape frays, goes white, then splits.
  float fray = smoothstep(0.72, 1.0, folds) * smoothstep(0.55, 0.95, dirtField);
  base = mix(base, vec3(lum * 1.8 + 0.10), fray * 0.45);
  h -= fray * 0.05;

  // (No taped-over repairs here. A Worley cell is round, and a round blob of a
  //  different colour reads as a polka dot, not a repair. Repairs are a strip
  //  of tape over a straight tear — that is geometry, not a tile.)

  alb = clamp(base, 0.02, 0.90);

  // ---- surface response -------------------------------------------------
  // Polyethylene is a dielectric with a real, if broad, specular lobe. This is
  // the property that separates it from cloth at a glance: a tarp has a sheen
  // that runs along the creases. Fade and dirt kill it.
  rough = 0.38 + 0.16 * (1.0 - top) + exposure * 0.26 + dirt * 0.22 + fray * 0.24;
  rough = clamp(rough, 0.22, 0.95);
  metal = 0.0;

  ao = clamp(0.72 + weave * 0.30 - hole * 0.45 - folds * 0.18, 0.20, 1.0);
}
`;

// ====================================================== painted plaster ==
export const PLASTER_PAINTED = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  vec2 p = uv * P + uSeed * 3.77;

  // ---- the cement render underneath -------------------------------------
  // Hand-floated, so it undulates at 20-40 cm and is sandy up close.
  float floatWave = owFbm(owWarp(p * 1.3, P * 1.3, 0.5, 3), P * 1.3, 4, 0.55);
  float sandy = owFbm01(p * 26.0, P * 26.0, 3, 0.5);
  vec4 grit = owWorley(p * 30.0, P * 30.0, 1.0);
  float render = 0.62 + floatWave * 0.10 + (sandy - 0.5) * 0.05 - grit.x * 0.03;
  // Cement render is a MID grey, and it has to stay clearly readable as a
  // different material from the paint rather than as a hole. Too dark here and
  // every peel scar reads as mould.
  vec3 renderCol = owSRGB(vec3(0.492, 0.478, 0.448));
  renderCol *= 0.90 + 0.18 * sandy;

  // ---- the paint --------------------------------------------------------
  // uTintA is the wall colour. Distemper and cheap emulsion chalk badly: the
  // pigment powders off under sun and rain, so a wall is never one value.
  vec3 paint = uTintA;
  float chalkField = owFbm01(owWarp(p * 0.9 + 5.1, P * 0.9, 0.8, 3), P * 0.9, 5, 0.58);
  float roller = owFbm01(owShear(p * 2.4, 0.0, 6.0), owShearPer(P * 2.4, 6.0), 3, 0.5);
  paint *= 0.88 + 0.20 * roller;                            // brush/roller lay
  // Chalking desaturates toward white rather than darkening.
  paint = mix(paint, mix(paint, vec3(1.0), 0.55), smoothstep(0.35, 0.95, chalkField) * 0.7);
  // A second coat in a slightly different batch — walls get repainted in parts.
  vec4 coat = owWorley(p * 0.55 + 21.0, P * 0.55, 0.9);
  paint *= 0.94 + 0.12 * coat.z;

  // ---- peeling ----------------------------------------------------------
  // Paint fails where damp gets behind it: it lifts in sheets with a hard,
  // slightly raised edge, and the render shows through. The sheet shape is a
  // warped worley cell, NOT a noise threshold — peel has a boundary.
  // Big cells, lightly warped. Paint comes off in SHEETS the size of a hand or
  // larger; small round cells read as spots of mould instead of failed paint.
  vec2 pw = owWarp(p * 0.85 + 9.7, P * 0.85, 0.45, 3);
  vec4 sheet = owWorley(pw, P * 0.85, 0.95);
  float damp = owFbm01(p * 0.7 + 33.0, P * 0.7, 4, 0.6);
  // Only the cells sitting on a damp patch have lost their paint.
  float peelMask = smoothstep(0.44, 0.70, damp) * step(0.42, sheet.z);
  float peel = peelMask * (1.0 - smoothstep(0.30, 0.46, sheet.x));
  peel = clamp(peel, 0.0, 1.0);
  // The lip: paint still attached right at the boundary, standing proud.
  float lip = peelMask * (1.0 - smoothstep(0.030, 0.085, abs(sheet.x - 0.38)));

  vec3 c = mix(paint, renderCol, peel);
  float ph = render + (1.0 - peel) * 0.055 + lip * 0.045;

  // Blistered-but-not-yet-detached paint around the peel edges.
  float blister = peelMask * smoothstep(0.46, 0.62, sheet.x) * (1.0 - peel);
  ph += blister * 0.02;
  c = mix(c, paint * 0.92, blister * 0.5);

  // ---- efflorescence ----------------------------------------------------
  // Salts wicked out of the render by rising damp, dried as a white bloom.
  // Sits low on the wall in reality; here it rides the damp field, and the
  // palette's ground-splash term puts the rest at the base.
  float bloom = smoothstep(0.62, 0.92, damp) * smoothstep(0.40, 0.85, owFbm01(p * 3.1, P * 3.1, 3, 0.55));
  c = mix(c, owSRGB(vec3(0.780, 0.770, 0.745)), bloom * 0.45);

  // ---- cracking ---------------------------------------------------------
  float crk = owCracks(p * 2.4, P * 2.4, 0.85, 0.026, 0.52);
  float crkFine = owCracks(p * 6.5 + 17.0, P * 6.5, 0.9, 0.018, 0.62) * 0.5;
  float cracks = clamp(crk + crkFine, 0.0, 1.0);
  ph -= cracks * 0.085;
  c = mix(c, renderCol * 0.42, cracks * 0.72);

  // ---- grime in the low ground ------------------------------------------
  // Peeling already drops the height, so an unguarded cavity term darkens every
  // peel scar a second time and turns exposed render into a black hole. Hold it
  // off the peeled areas and let it do its job in the cracks instead.
  float cavity = (1.0 - smoothstep(0.50, 0.80, ph)) * (1.0 - peel * 0.85);
  c = mix(c, owSRGB(vec3(0.126, 0.124, 0.108)), cavity * 0.34);

  h = clamp(ph, 0.0, 1.0);
  alb = clamp(c, 0.02, 0.90);

  // Emulsion holds a slight sheen; chalked, peeled and cracked areas do not.
  rough = 0.70 + chalkField * 0.14 + peel * 0.16 + cracks * 0.10 - roller * 0.05;
  rough = clamp(rough, 0.42, 1.0);
  metal = 0.0;
  ao = clamp(1.0 - cracks * 0.45 - peel * 0.16 - cavity * 0.22, 0.25, 1.0);
}
`;

// ========================================================= mossy concrete ==
export const MOSS_CONCRETE = /* glsl */ `
void owSurface(vec2 uv, out vec3 alb, out float h, out float rough, out float metal, out float ao){
  const vec2 P = vec2(8.0);
  vec2 p = uv * P + uSeed * 5.19;

  // ---- concrete ---------------------------------------------------------
  float pour  = owFbm01(owWarp(p * 1.4, P * 1.4, 0.65, 3), P * 1.4, 5, 0.52);
  float mid   = owFbm01(p * 4.5, P * 4.5, 4, 0.5);
  vec4  agg   = owWorley(p * 12.0, P * 12.0, 0.95);
  vec4  pores = owWorley(p * 24.0, P * 24.0, 1.0);
  float fine  = owFbm01(p * 32.0, P * 32.0, 3, 0.5);

  // Aggregate showing through where the laitance has worn off.
  float exposedAgg = smoothstep(0.55, 0.85, pour) * (1.0 - smoothstep(0.10, 0.30, agg.x));
  // Blowholes from a bad vibrate — a formed face is never solid.
  float blow = (1.0 - smoothstep(0.03, 0.13, pores.x)) * step(0.55, pores.z);

  float ch = 0.64 + (pour - 0.5) * 0.17 + (mid - 0.5) * 0.09 + (fine - 0.5) * 0.035;
  ch -= blow * 0.22;
  ch += exposedAgg * 0.045;
  // The aggregate itself stands proud where the laitance has gone.
  ch += (1.0 - smoothstep(0.06, 0.26, agg.x)) * exposedAgg * 0.05;

  vec3 wet = owSRGB(vec3(0.318, 0.322, 0.310));   // damp concrete, cool grey
  vec3 dry = owSRGB(vec3(0.470, 0.462, 0.436));
  vec3 c = mix(wet, dry, smoothstep(0.30, 0.80, pour) * 0.75);
  c *= 0.92 + 0.14 * fine;
  c = mix(c, owSRGB(vec3(0.545, 0.520, 0.478)), exposedAgg * 0.5);

  // Form-tie holes and board marks: this is shuttered concrete, not cast stone.
  float board = owFbm01(owShear(p * 1.9, 0.0, 14.0), owShearPer(P * 1.9, 14.0), 3, 0.5);
  ch += (board - 0.5) * 0.022;

  float crk = owCracks(p * 2.0, P * 2.0, 0.85, 0.024, 0.55);
  ch -= crk * 0.08;
  c = mix(c, wet * 0.45, crk * 0.6);

  // ---- biological colonisation ------------------------------------------
  // The whole point of this surface. Algae needs water that lingers, so it
  // grows in the CAVITIES — blowholes, crack lines, the low ground of the
  // pour — not evenly over the face. Driving it off height rather than off an
  // independent noise is what makes it read as growth instead of green paint.
  float lowGround = 1.0 - smoothstep(0.40, 0.74, ch);

  // NOTE ON RANGE. owFbm01 is fbm*0.5+0.5 and an fbm with gain 0.5-0.6 almost
  // never reaches its nominal extremes — in practice it lives in roughly
  // 0.33..0.67. Feeding that straight into a smoothstep(0.34, 0.80, …) leaves
  // the top half of the curve unreachable and multiplies out to a few percent,
  // which is how the first version of this surface ended up with no visible
  // algae at all. Remap onto the range the noise actually occupies first.
  float damp = owFbm01(owWarp(p * 0.75 + 61.0, P * 0.75, 0.9, 3), P * 0.75, 4, 0.62);
  damp = owRemap(damp, 0.36, 0.66, 0.0, 1.0);
  float colony = owFbm01(p * 5.5 + 23.0, P * 5.5, 4, 0.55);
  colony = owRemap(colony, 0.36, 0.66, 0.0, 1.0);

  // Two organisms, and they do not look alike. Algae is a thin green-black
  // film that follows the water. Moss is a raised velvet cushion that only
  // establishes where the film has already broken the surface down.
  float algae = clamp(damp * (0.40 + 0.75 * lowGround) * (0.35 + 0.75 * colony), 0.0, 1.0);
  float moss  = clamp(smoothstep(0.52, 0.88, damp) * smoothstep(0.44, 0.80, colony)
                    * (0.30 + 0.70 * lowGround), 0.0, 1.0);

  vec3 algaeCol = owSRGB(vec3(0.116, 0.148, 0.086));   // green-black film
  vec3 mossCol  = owSRGB(vec3(0.170, 0.240, 0.104));   // brighter, yellower
  c = mix(c, algaeCol, algae * 0.85);
  c = mix(c, mossCol, moss * 0.88);

  // Moss sits proud and holds water; algae is thin and fills the pits.
  ch += moss * 0.055 - algae * 0.014;

  // A rust weep from the reinforcement, where the cover is too thin. Common
  // enough on cheap RCC to be worth a line.
  float weep = step(0.88, owFbm01(p * 0.9 + 77.0, P * 0.9, 3, 0.6))
             * smoothstep(0.40, 0.85, colony);
  c = mix(c, owSRGB(vec3(0.352, 0.196, 0.104)), weep * 0.35);

  h = clamp(ch, 0.0, 1.0);
  alb = clamp(c, 0.02, 0.90);

  // Damp concrete is glossier than dry; moss is completely matte and kills the
  // specular outright, which is most of how it reads as organic.
  rough = 0.90 - algae * 0.16 - smoothstep(0.4, 0.9, damp) * 0.10 + exposedAgg * 0.05;
  rough = mix(rough, 0.99, moss);
  rough = clamp(rough, 0.34, 1.0);
  metal = 0.0;

  ao = clamp(1.0 - blow * 0.55 - crk * 0.45 - moss * 0.20 - lowGround * 0.15, 0.20, 1.0);
}
`;
