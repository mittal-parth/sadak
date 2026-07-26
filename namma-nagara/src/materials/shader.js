import * as THREE from 'three';

/**
 * onBeforeCompile extension for MeshStandardMaterial / MeshPhysicalMaterial.
 *
 * Adds, on top of three's standard PBR shading:
 *   - world / object planar + triplanar projection (no UVs required on the mesh)
 *   - parallax occlusion mapping driven by the height packed in albedo.a
 *   - a micro detail-normal layer that fades out with distance
 *   - macro low-frequency variation (the anti-tiling multiply)
 *   - stochastic two-scale de-tiling with height-preserving blending
 *   - procedural weathering: top-face dust, rain streaks, ground splash
 *   - cavity grime and vertex-colour driven edge wear / dirt masks
 *
 * Everything is a #define so a material only pays for the features it enables.
 *
 * Vertex colour mask contract (all default to 0 = "no effect", so a mesh with
 * no colour attribute is unaffected):
 *   r = edge wear, g = grime, b = extra AO, a = per-instance tint variation
 */

const PARS_VERTEX = /* glsl */ `
varying vec3 vOwWPos;
varying vec3 vOwWNrm;
#ifdef OW_OBJECT_SPACE
  varying vec3 vOwOPos;
  varying vec3 vOwONrm;
  varying mat3 vOwP2V;
#endif
#ifdef OW_PARALLAX
  varying vec3 vOwViewDirP;
#endif
`;

const MAIN_VERTEX = /* glsl */ `
{
  mat4 owModel = modelMatrix;
  #ifdef USE_BATCHING
    owModel = owModel * batchingMatrix;
  #endif
  #ifdef USE_INSTANCING
    owModel = owModel * instanceMatrix;
  #endif
  vec4 owWP = owModel * vec4( transformed, 1.0 );
  vOwWPos = owWP.xyz;
  vOwWNrm = normalize( mat3( owModel ) * objectNormal );

  #ifdef OW_OBJECT_SPACE
    vOwOPos = transformed;
    vOwONrm = normalize( objectNormal );
    mat3 owR = mat3( owModel );
    owR[ 0 ] = normalize( owR[ 0 ] );
    owR[ 1 ] = normalize( owR[ 1 ] );
    owR[ 2 ] = normalize( owR[ 2 ] );
    vOwP2V = mat3( viewMatrix ) * owR;
  #endif

  #ifdef OW_PARALLAX
    #ifdef OW_OBJECT_SPACE
      vOwViewDirP = ( inverse( owModel ) * vec4( cameraPosition, 1.0 ) ).xyz - transformed;
    #else
      vOwViewDirP = cameraPosition - owWP.xyz;
    #endif
  #endif
}
`;

const PARS_FRAGMENT = /* glsl */ `
varying vec3 vOwWPos;
varying vec3 vOwWNrm;
#ifdef OW_OBJECT_SPACE
  varying vec3 vOwOPos;
  varying vec3 vOwONrm;
  varying mat3 vOwP2V;
#endif
#ifdef OW_PARALLAX
  varying vec3 vOwViewDirP;
#endif

uniform sampler2D owDetailNrm;
uniform sampler2D owDetailTex;   // rgb = micro albedo variation, a = micro height
uniform sampler2D owMacroTex;
uniform vec4  owTile;        // xy = scale (tiles per metre, or uv multiplier), zw = offset
uniform vec4  owDetailP;     // x tile, y normal amt, z albedo amt, w fade distance
uniform vec4  owMacroP;      // x scale, y albedo amt, z rough amt, w hue amt
uniform vec4  owMacroBig;    // x contrast, y big-band amt, z big-band scale, w unused
uniform vec4  owPatchP;      // x coverage, y cell metres, z albedo delta, w rough delta
uniform vec4  owClothP;      // x transmission, y underside darkening, z fold amt, w unused
uniform vec4  owParallaxP;   // x depth (m), y fade start, z fade end, w max layers
uniform vec4  owWeatherP;    // x dust, y streak, z splash height, w cavity grime
uniform vec4  owWearP;       // x wear amt, y grime amt, z vcol AO amt, w curvature
uniform vec3  owTintCol;
uniform vec3  owDustCol;
uniform vec3  owGrimeCol;
uniform vec3  owRustCol;
uniform vec4  owWearMat;     // x rough, y metal, z reserved, w tint amount
uniform vec3  owWearCol;
uniform vec4  owRoughP;      // x scale, y offset, z detile amount, w minimum
uniform float owNormalAmp;
uniform float owGroundY;
uniform float owAoAmt;
uniform float owMacroRelief;

// Explicit-gradient sampling keeps the mip selection correct through the
// parallax march; OW_NOGRAD falls back to implicit derivatives.
#ifdef OW_NOGRAD
  #define OW_TEX( t, uv, dx, dy ) texture2D( t, uv )
#else
  #define OW_TEX( t, uv, dx, dy ) textureGrad( t, uv, dx, dy )
#endif

/**
 * One directional light's contribution to fabric transmission. A macro with a
 * literal index rather than a loop: GLSL ES 1.00 will not index a uniform array
 * of structs with a running variable, and the light count is 2 (sun + moon).
 *
 * owBackLit  = beam landing on the face we are NOT looking at.
 * owFwd      = forward-scatter lobe, brightest looking nearly along the beam.
 */
#define OW_CLOTH_LIGHT( IDX ) { \
  IncidentLight owCl; \
  getDirectionalLightInfo( directionalLights[ IDX ], owCl ); \
  float owBackLit = max( 0.0, -dot( normal, owCl.direction ) ); \
  float owFwd = max( 0.0, dot( geometryViewDir, -owCl.direction ) ); \
  owTrans += owCl.color * ( owBackLit * ( 0.30 + 0.90 * owFwd * owFwd ) ); \
}

// filled by the surface evaluation, consumed by the chunk overrides below
vec4  owAlbedo;
vec3  owORM;          // ao, rough, metal
vec3  owNormalV;      // view-space shading normal
float owHeightS;

float owHash11( float x ){
  float p = fract( x * 0.1031 );
  p *= p + 33.33;
  p *= p + p;
  return fract( p );
}

/**
 * Runoff staining below a source.
 *
 * Real rain streaks start at something — a sill, a broken gutter, a slab edge —
 * and die out a metre or so below it. sAxis is the horizontal coordinate along
 * the wall, y the world height. Returns .x = 0..1: fades in over the first 15 cm
 * below the source and out over the next 1.5 m, in discrete columns, so a wall
 * gets a handful of dark runs rather than a uniform vertical grain.
 * .y carries the per-column random used to pick rusted fixings.
 */
vec3 owRunoff( float sAxis, float y, float wobble ){
  float u = sAxis * 1.55;
  float cell = floor( u );                            // ~65 cm source columns
  float lat = fract( u );
  float r0 = owHash11( cell * 1.37 + 3.1 );
  float r1 = owHash11( cell * 2.71 + 11.7 );
  // Only some columns have anything dripping down them.
  float srcAmt = smoothstep( 0.30, 0.62, r0 ) * ( 0.55 + 0.45 * r1 );
  // Feathered across the column, so a run has soft sides instead of cell walls.
  float bell = sin( lat * 3.14159265 );
  srcAmt *= bell * bell * ( 0.8 + 0.45 * r0 );
  // Sources sit roughly one storey apart, jittered per column.
  const float SPACING = 2.85;
  float jitter = r1 * 1.2 + r0 * 0.5;
  float srcY = ( floor( ( y + jitter ) / SPACING ) + 1.0 ) * SPACING - jitter + wobble * 0.2;
  float below = srcY - y;
  float run = smoothstep( 0.0, 0.15, below ) * ( 1.0 - smoothstep( 0.15, 1.65, below ) );
  return vec3( clamp( run * srcAmt, 0.0, 1.0 ), r1, below );
}

mat3 owTangentFrame( vec3 eye, vec3 n, vec2 uv ){
  vec3 q0 = dFdx( eye ), q1 = dFdy( eye );
  vec2 s0 = dFdx( uv ), s1 = dFdy( uv );
  vec3 q1p = cross( q1, n );
  vec3 q0p = cross( n, q0 );
  vec3 T = q1p * s0.x + q0p * s1.x;
  vec3 B = q1p * s0.y + q0p * s1.y;
  float det = max( dot( T, T ), dot( B, B ) );
  float sc = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
  return mat3( T * sc, B * sc, n );
}

struct OwFrame { vec2 uv; vec3 T; vec3 B; vec3 N; };

OwFrame owAxisFrame( vec3 p, vec3 n, int axis ){
  vec3 s = mix( vec3( -1.0 ), vec3( 1.0 ), step( 0.0, n ) );
  OwFrame f;
  if ( axis == 0 ){
    f.uv = vec2( -p.z * s.x, p.y );
    f.T = vec3( 0.0, 0.0, -s.x ); f.B = vec3( 0.0, 1.0, 0.0 ); f.N = vec3( s.x, 0.0, 0.0 );
  } else if ( axis == 1 ){
    f.uv = vec2( p.x, -p.z * s.y );
    f.T = vec3( 1.0, 0.0, 0.0 ); f.B = vec3( 0.0, 0.0, -s.y ); f.N = vec3( 0.0, s.y, 0.0 );
  } else {
    f.uv = vec2( p.x * s.z, p.y );
    f.T = vec3( s.z, 0.0, 0.0 ); f.B = vec3( 0.0, 1.0, 0.0 ); f.N = vec3( 0.0, 0.0, s.z );
  }
  f.uv = f.uv * owTile.xy + owTile.zw;
  return f;
}

/** Re-anchor an axis frame onto the true interpolated normal. */
void owOrthonormalise( inout OwFrame f, vec3 n ){
  f.N = n;
  f.T = normalize( f.T - n * dot( n, f.T ) );
  f.B = cross( n, f.T );
}

/**
 * Parallax occlusion mapping. Marches the height field stored in albedo.a
 * and returns the displaced uv. Layer count follows the grazing angle and
 * the whole effect fades out with distance.
 */
vec2 owPOM( vec2 uv, vec3 vt, vec2 ddx, vec2 ddy, float depth, float fade ){
  if ( depth <= 0.0 || fade <= 0.001 ) return uv;
  float nl = mix( owParallaxP.w, 8.0, clamp( abs( vt.z ), 0.0, 1.0 ) );
  nl = max( nl * fade, 4.0 );
  float layer = 1.0 / nl;
  vec2 P = ( vt.xy / max( abs( vt.z ), 0.30 ) ) * depth * fade;
  vec2 dUv = P * layer;

  float cur = 0.0;
  vec2 c = uv;
  float d = 1.0 - OW_TEX( map, c, ddx, ddy ).a;
  for ( int i = 0; i < 48; i ++ ){
    if ( cur >= d || float( i ) >= nl ) break;
    c -= dUv;
    d = 1.0 - OW_TEX( map, c, ddx, ddy ).a;
    cur += layer;
  }
  vec2 prev = c + dUv;
  float after = d - cur;
  float before = ( 1.0 - OW_TEX( map, prev, ddx, ddy ).a ) - cur + layer;
  float w = clamp( after / max( after - before, 1e-4 ), 0.0, 1.0 );
  return mix( c, prev, w );
}

/** Height-preserving blend of two texture samples (kills the mushy 50% lerp). */
void owHeightBlend( inout vec4 a, inout vec3 ormA, inout vec3 nA,
                    vec4 b, vec3 ormB, vec3 nB, float t ){
  float wa = ( 1.0 - t ) + a.a * 0.6;
  float wb = t + b.a * 0.6;
  float k = max( wa, wb ) - 0.18;
  wa = max( wa - k, 0.0 );
  wb = max( wb - k, 0.0 );
  float inv = 1.0 / max( wa + wb, 1e-4 );
  a = ( a * wa + b * wb ) * inv;
  ormA = ( ormA * wa + ormB * wb ) * inv;
  nA = normalize( ( nA * wa + nB * wb ) * inv );
}
`;

const MAIN_FRAGMENT = /* glsl */ `
{
  float owDist = length( vViewPosition );
  float owFaceDir = gl_FrontFacing ? 1.0 : -1.0;
  vec3 owNw = normalize( vOwWNrm ) * owFaceDir;

  #ifdef OW_OBJECT_SPACE
    vec3 owP = vOwOPos;
    vec3 owNp = normalize( vOwONrm ) * owFaceDir;
    mat3 owP2V = vOwP2V;
  #else
    vec3 owP = vOwWPos;
    vec3 owNp = owNw;
    mat3 owP2V = mat3( viewMatrix );
  #endif

  vec4 alb; vec3 orm; vec3 nT; vec3 nShade;
  // Micro (sub-millimetre) height from the shared detail set, -1..1. This is the
  // aggregate / plaster-tooth / grit read at 0.5 m; it fades out with distance so
  // the near ground gains detail instead of shimmering.
  float owMicro = 0.0;
  float owDetFade = 0.0;

  #ifdef OW_TRIPLANAR

    vec3 an = abs( owNp );
    vec3 w = pow( an, vec3( 5.0 ) );
    w /= max( w.x + w.y + w.z, 1e-4 );

    OwFrame fx = owAxisFrame( owP, owNp, 0 );
    OwFrame fy = owAxisFrame( owP, owNp, 1 );
    OwFrame fz = owAxisFrame( owP, owNp, 2 );

    vec4 ax = texture2D( map, fx.uv );
    vec4 ay = texture2D( map, fy.uv );
    vec4 az = texture2D( map, fz.uv );
    alb = ax * w.x + ay * w.y + az * w.z;

    vec3 ox = texture2D( roughnessMap, fx.uv ).rgb;
    vec3 oy = texture2D( roughnessMap, fy.uv ).rgb;
    vec3 oz = texture2D( roughnessMap, fz.uv ).rgb;
    orm = ox * w.x + oy * w.y + oz * w.z;

    vec3 nx = texture2D( normalMap, fx.uv ).xyz * 2.0 - 1.0;
    vec3 ny = texture2D( normalMap, fy.uv ).xyz * 2.0 - 1.0;
    vec3 nz = texture2D( normalMap, fz.uv ).xyz * 2.0 - 1.0;
    nx.xy *= owNormalAmp; ny.xy *= owNormalAmp; nz.xy *= owNormalAmp;
    vec3 wnx = fx.T * nx.x + fx.B * nx.y + fx.N * nx.z;
    vec3 wny = fy.T * ny.x + fy.B * ny.y + fy.N * ny.z;
    vec3 wnz = fz.T * nz.x + fz.B * nz.y + fz.N * nz.z;
    vec3 nP = normalize( wnx * w.x + wny * w.y + wnz * w.z );

    // detail, projected on the dominant plane only (one extra fetch)
    OwFrame fd = fz;
    if ( an.y > max( an.x, an.z ) ) fd = fy;
    else if ( an.x > an.z ) fd = fx;
    vec2 detUv = fd.uv * owDetailP.x;
    float detFade = 1.0 - smoothstep( owDetailP.w * 0.45, owDetailP.w, owDist );
    owDetFade = detFade;
    vec3 dn = texture2D( owDetailNrm, detUv ).xyz * 2.0 - 1.0;
    vec3 dW = fd.T * dn.x + fd.B * dn.y + fd.N * dn.z;
    nP = normalize( nP + ( dW - fd.N * dot( dW, fd.N ) ) * owDetailP.y * detFade );
    vec4 dTex = texture2D( owDetailTex, detUv );
    owMicro = ( dTex.a - 0.5 ) * 2.0;
    alb.rgb *= 1.0 + ( owMicro * 0.95 + ( dTex.r - 0.5 ) * 1.25 ) * owDetailP.z * detFade;
    orm.r *= 1.0 - max( -owMicro, 0.0 ) * 0.30 * owDetailP.z * detFade;

    nShade = normalize( owP2V * nP );
    owHeightS = clamp( alb.a + owMicro * 0.16 * detFade, 0.0, 1.0 );

  #else

    #ifdef OW_MESH_UV
      vec2 baseUv = vMapUv * owTile.xy + owTile.zw;
      mat3 tbnV = owTangentFrame( -vViewPosition, normalize( vNormal ) * owFaceDir, baseUv );
      OwFrame f;
      f.uv = baseUv;
      f.T = tbnV[ 0 ]; f.B = tbnV[ 1 ]; f.N = tbnV[ 2 ];
    #else
      int axis = ( abs( owNp.x ) > abs( owNp.y ) )
        ? ( ( abs( owNp.x ) > abs( owNp.z ) ) ? 0 : 2 )
        : ( ( abs( owNp.y ) > abs( owNp.z ) ) ? 1 : 2 );
      OwFrame f = owAxisFrame( owP, owNp, axis );
      owOrthonormalise( f, owNp );
    #endif

    vec2 ddx = dFdx( f.uv );
    vec2 ddy = dFdy( f.uv );
    vec2 uv = f.uv;

    #ifdef OW_PARALLAX
      #ifdef OW_MESH_UV
        vec3 Vp = normalize( vViewPosition );
      #else
        vec3 Vp = normalize( vOwViewDirP );
      #endif
      vec3 vt = normalize( vec3( dot( Vp, f.T ), dot( Vp, f.B ), dot( Vp, f.N ) ) );
      float pFade = 1.0 - smoothstep( owParallaxP.y, owParallaxP.z, owDist );
      uv = owPOM( uv, vt, ddx, ddy, owParallaxP.x, pFade );
    #endif

    alb = OW_TEX( map, uv, ddx, ddy );
    orm = OW_TEX( roughnessMap, uv, ddx, ddy ).rgb;
    nT = OW_TEX( normalMap, uv, ddx, ddy ).xyz * 2.0 - 1.0;
    nT.xy *= owNormalAmp;

    #ifdef OW_DETILE
      // Second sample of the same texture, rotated and rescaled, blended by a
      // low-frequency mask: breaks the repeat without a second texture set.
      vec2 uv2 = vec2( uv.x * 0.803 - uv.y * 0.596, uv.x * 0.596 + uv.y * 0.803 ) * 0.617
               + vec2( 0.37, 0.71 );
      vec2 ddx2 = vec2( ddx.x * 0.803 - ddx.y * 0.596, ddx.x * 0.596 + ddx.y * 0.803 ) * 0.617;
      vec2 ddy2 = vec2( ddy.x * 0.803 - ddy.y * 0.596, ddy.x * 0.596 + ddy.y * 0.803 ) * 0.617;
      vec4 alb2 = OW_TEX( map, uv2, ddx2, ddy2 );
      vec3 orm2 = OW_TEX( roughnessMap, uv2, ddx2, ddy2 ).rgb;
      vec3 n2 = OW_TEX( normalMap, uv2, ddx2, ddy2 ).xyz * 2.0 - 1.0;
      n2.xy *= owNormalAmp;
    #endif

    // ---- micro detail normal, faded by distance ----
    float detFade = 1.0 - smoothstep( owDetailP.w * 0.45, owDetailP.w, owDist );
    owDetFade = detFade;
    vec3 dn = OW_TEX( owDetailNrm, uv * owDetailP.x, ddx * owDetailP.x, ddy * owDetailP.x ).xyz * 2.0 - 1.0;
    nT = normalize( vec3( nT.xy + dn.xy * owDetailP.y * detFade, nT.z ) );
    #ifdef OW_DETILE
      n2 = normalize( vec3( n2.xy + dn.xy * owDetailP.y * detFade, n2.z ) );
      float dtm = clamp( ( texture2D( owMacroTex, ( owP.xz + owP.y * 0.7 ) * owMacroP.x * 5.0 + 0.21 ).g - 0.36 ) * 2.4, 0.0, 1.0 );
      owHeightBlend( alb, orm, nT, alb2, orm2, n2, dtm * owRoughP.z );
    #endif
    // Sub-millimetre aggregate / tooth / grit: the height channel of the shared
    // micro set drives an albedo speckle *and* the cavity height, so the layer
    // shades instead of just tinting.
    vec4 dTex = OW_TEX( owDetailTex, uv * owDetailP.x, ddx * owDetailP.x, ddy * owDetailP.x );
    owMicro = ( dTex.a - 0.5 ) * 2.0;
    alb.rgb *= 1.0 + ( owMicro * 0.95 + ( dTex.r - 0.5 ) * 1.25 ) * owDetailP.z * detFade;
    // Aggregate reads dark in its troughs even in full sun, because a trough
    // is a tiny occluded pocket. Modulating only the albedo gives a washed
    // pattern; darkening the cavity as well is what makes it read as depth.
    orm.r *= 1.0 - max( -owMicro, 0.0 ) * 0.30 * owDetailP.z * detFade;

    owHeightS = clamp( alb.a + owMicro * 0.16 * detFade, 0.0, 1.0 );
    #ifdef OW_MESH_UV
      nShade = normalize( f.T * nT.x + f.B * nT.y + f.N * nT.z );
    #else
      nShade = normalize( owP2V * ( f.T * nT.x + f.B * nT.y + f.N * nT.z ) );
    #endif

  #endif

  // ------------------------------------------------ macro variation ----
  vec2 macroUv = mix( vec2( vOwWPos.x + vOwWPos.z * 0.63, vOwWPos.y ), vOwWPos.xz,
                      step( 0.62, abs( owNw.y ) ) );
  float owUpFace = step( 0.62, abs( owNw.y ) );
  vec4 mac1 = texture2D( owMacroTex, macroUv * owMacroP.x );
  vec4 mac2 = texture2D( owMacroTex, macroUv * owMacroP.x * 0.211 + 0.37 );
  // fbm never spans 0..1, so averaging two bands collapses toward 0.5 and the
  // "anti-tiling" multiply becomes a 5% wash. owMacroBig.x expands the contrast
  // back out before it is used, which is what lets a 12 m facade break up.
  float macro = clamp( ( mac1.r * 0.55 + mac2.b * 0.45 - 0.5 ) * owMacroBig.x + 0.5, 0.0, 1.0 );
  alb.rgb *= mix( 1.0, 0.55 + 0.92 * macro, owMacroP.y );
  // A second, much larger band (8-16 m features): the difference between one
  // sun-bleached end of a facade and the damp end, which is the signal that
  // survives at 40 m when everything finer has mipped away.
  if ( owMacroBig.y > 0.0 ) {
    vec2 bigUv = macroUv * owMacroBig.z;
    float big = texture2D( owMacroTex, bigUv ).r * 0.62
              + texture2D( owMacroTex, bigUv * 0.37 + 0.61 ).b * 0.38;
    big = clamp( ( big - 0.5 ) * 2.3, -1.0, 1.0 );
    alb.rgb *= 1.0 + big * owMacroBig.y;
    orm.g = clamp( orm.g - big * owMacroBig.y * 0.55, 0.0, 1.0 );
  }
  alb.rgb *= mix( vec3( 1.0 ), vec3( 1.05, 1.0, 0.93 ), ( mac2.r - 0.5 ) * owMacroP.w );
  // Roughness has to vary or nothing in the frame ever glints: a broad patch
  // term plus a tighter one, both signed, plus the micro tooth.
  orm.g = clamp( orm.g + ( mac1.g - 0.5 ) * owMacroP.z
                       + ( mac1.a - 0.5 ) * 0.16
                       - owMicro * 0.07 * owDetFade, 0.0, 1.0 );

  #ifdef OW_MACRO_RELIEF
    // Ruts, drifts and shallow patches at 1-4 m. The tile can't carry anything
    // this large, so the shading normal is tilted by the gradient of the macro
    // map — stones and swales then catch the sun instead of reading as dither.
    vec2 mUv = macroUv * owMacroP.x;
    float mhx = texture2D( owMacroTex, mUv + vec2( 0.035, 0.0 ) ).b;
    float mhy = texture2D( owMacroTex, mUv + vec2( 0.0, 0.035 ) ).b;
    vec2 mg = ( vec2( mhx, mhy ) - mac1.b ) * owMacroRelief * owUpFace;
    vec3 tiltW = vec3( -mg.x, 0.0, -mg.y );
    tiltW -= owNw * dot( owNw, tiltW );
    nShade = normalize( nShade + mat3( viewMatrix ) * tiltW );
    alb.rgb *= 1.0 - ( mac1.b - 0.5 ) * 0.16 * owUpFace;
  #endif

  // Horizontal coordinate along a wall, shared by the patch and runoff layers.
  float owVert = smoothstep( 0.72, 0.34, abs( owNw.y ) );
  float owSAxis = vOwWPos.z * owNw.x - vOwWPos.x * owNw.z;

  // ------------------------------------------------- repair patches ----
  #ifdef OW_PATCH
  {
    // Somebody has replastered part of this wall. A repair is a RECTANGLE in the
    // plane of the facade, a few percent off the surrounding mix in value, a
    // little smoother because it is newer, and it has a trowel edge — a small
    // raised ridge where the new render was feathered out. Covering ~10% of each
    // facade with these is what stops a 12 m wall reading as one flat colour.
    float cw = max( owPatchP.y, 0.4 );
    vec2 pc = vec2( owSAxis, vOwWPos.y ) / cw;
    // wander the lattice so the cells are not a visible grid
    pc += ( vec2( mac2.r, mac2.g ) - 0.5 ) * 0.35;
    vec2 cid = floor( pc );
    vec2 cf = pc - cid;
    float r0 = owHash11( cid.x * 7.31 + cid.y * 13.77 + 5.1 );
    float r1 = owHash11( cid.x * 3.17 + cid.y * 9.41 + 21.3 );
    float r2 = owHash11( cid.x * 11.93 + cid.y * 4.73 + 37.7 );
    float r3 = owHash11( cid.x * 5.51 + cid.y * 17.29 + 53.9 );
    float has = step( 1.0 - clamp( owPatchP.x, 0.0, 1.0 ), r0 );
    vec2 lo = vec2( 0.05 + r1 * 0.30, 0.05 + r2 * 0.30 );
    vec2 hi = vec2( 0.95 - r2 * 0.26, 0.95 - r3 * 0.26 );
    float fe = 0.028 + 0.030 * r1;          // ~3-6 cm of trowel feather
    vec2 a0 = smoothstep( lo, lo + fe, cf );
    vec2 a1 = 1.0 - smoothstep( hi - fe, hi, cf );
    float pm = a0.x * a0.y * a1.x * a1.y * has * owVert;
    if ( pm > 0.001 ) {
      float sgn = r3 > 0.48 ? 1.0 : -1.0;
      alb.rgb *= 1.0 + sgn * owPatchP.z * pm;
      // A cement repair is greyer and cooler than the render around it; a patch
      // in the original mix that has weathered separately goes warmer. Value
      // alone reads as a lighting artefact — it needs the hue shift too.
      vec3 pTint = sgn > 0.0 ? vec3( 0.975, 0.988, 1.020 ) : vec3( 1.030, 1.008, 0.968 );
      alb.rgb *= mix( vec3( 1.0 ), pTint, pm );
      // a fresh coat has lost the mould and the fine crazing of the old wall
      orm.g = clamp( orm.g + owPatchP.w * pm, 0.0, 1.0 );
      // the trowel edge: a bright arris where the new render feathers out
      float lip = pm * ( 1.0 - pm ) * 4.0;
      alb.rgb *= 1.0 + lip * 0.13;
      owHeightS = clamp( owHeightS + pm * 0.07 + lip * 0.05, 0.0, 1.0 );
    }
  }
  #endif

  // ------------------------------------------------------ weathering ----
  #ifdef OW_WEATHER
    float up = clamp( owNw.y, 0.0, 1.0 );
    float dust = up * up * owWeatherP.x * smoothstep( 0.30, 0.80, mac1.b * 0.7 + mac2.g * 0.5 );
    alb.rgb = mix( alb.rgb, owDustCol, dust * 0.75 );
    orm.g = clamp( orm.g + dust * 0.30, 0.0, 1.0 );
    orm.b *= 1.0 - dust * 0.85;
    nShade = normalize( mix( nShade, normalize( owP2V * owNp ), dust * 0.35 ) );

    // ---- rain runoff -------------------------------------------------------
    // Streaks live on near-vertical faces only, below a source, and are 3-8 cm
    // wide with roughly a 3:1 vertical stretch. (A 10:1 stretch of a value-noise
    // channel over a whole wall is a wood-grain generator, not weathering.)
    float vert = owVert;
    float sAxis = owSAxis;
    float sN = texture2D( owMacroTex, vec2( sAxis * 0.46, vOwWPos.y * 0.155 ) ).a;
    float sFine = texture2D( owMacroTex, vec2( sAxis * 1.35 + 0.4, vOwWPos.y * 0.42 ) ).g;
    vec3 runoff = owRunoff( sAxis, vOwWPos.y, sN - 0.5 );
    float streak = clamp( owWeatherP.y * 2.2, 0.0, 1.15 ) * vert * runoff.x
                 * smoothstep( 0.30, 0.66, sN * 0.72 + sFine * 0.38 );
    streak = clamp( streak, 0.0, 1.0 );
    #ifdef OW_VCOL_MASKS
      // The world knows exactly where the water comes off — buildings.js places a
      // runoff strip under every sill, shopfront head and cornice with the grime
      // mask driven to ~1 at its source (see util.runoffStreak). A mask that high
      // only ever comes from something authored as a stain, so it drives the run
      // outright instead of merely modulating the procedural columns.
      float owStainM = smoothstep( 0.58, 0.98, vColor.g );
      streak = clamp( streak * ( 0.45 + 0.75 * clamp( vColor.g * 1.5 + vColor.b * 0.6, 0.0, 1.0 ) )
                    + owStainM * vert
                      * ( 0.55 + 0.45 * smoothstep( 0.20, 0.70, sN * 0.6 + sFine * 0.55 ) ),
                    0.0, 1.0 );
    #endif
    // A wet-then-dried run on render is a real 20-35% drop in albedo: at 10% it
    // is invisible from across the street, which is the whole point of a streak.
    vec3 runCol = mix( alb.rgb * 0.72, owGrimeCol, 0.26 );
    // Rust bleed under metal fixings — brackets, rebar ends, gutter straps.
    // strongest right under the fixing, thinning as it runs down
    float rust = clamp( step( 0.86, runoff.y ) * 0.9 + orm.b * 0.5, 0.0, 1.0 )
               * ( 0.30 + 0.70 * ( 1.0 - smoothstep( 0.1, 0.9, runoff.z ) ) );
    runCol = mix( runCol, mix( alb.rgb * 0.94, owRustCol, 0.5 ), rust );
    alb.rgb = mix( alb.rgb, runCol, streak );
    orm.g = clamp( orm.g + streak * 0.09, 0.0, 1.0 );
    orm.b *= 1.0 - streak * 0.35;

    // ---- ground splash ----------------------------------------------------
    // A hard dirt band in the bottom ~20 cm plus thinning splatter above it.
    float hAbove = vOwWPos.y - owGroundY;
    float band = 1.0 - smoothstep( 0.02, 0.22, hAbove );
    float spray = 1.0 - smoothstep( 0.10, max( owWeatherP.z, 1e-3 ), hAbove );
    float splash = vert * max( band, spray * spray * 0.85 ) * step( 1e-4, owWeatherP.z );
    // Broken up at 1-2 m, but with a floor so the base of every wall darkens.
    splash *= 0.55 + 0.45 * smoothstep( 0.25, 0.72, mac1.b * 0.7 + mac2.g * 0.4 );
    // Dust and rain-thrown dirt, not soot: a blend of the two weathering colours.
    vec3 splashCol = mix( owGrimeCol, owDustCol * 0.9, 0.35 );
    alb.rgb = mix( alb.rgb * ( 1.0 - splash * 0.35 ), splashCol, splash * 0.42 );
    orm.g = clamp( orm.g + splash * 0.16 - band * vert * 0.10, 0.0, 1.0 );
    orm.r *= 1.0 - splash * 0.18;
    orm.b *= 1.0 - splash * 0.7;

    // ---- dust wedge at the wall / ground junction -------------------------
    // A wall does not meet the ground on a line: wind and foot traffic pile a
    // 25-40 cm wedge of the ground's own dust against it, and the value of that
    // wedge is most of the way from the wall to the road. Without it every
    // wall/ground junction in the frame is a razor cut.
    float wedgeH = 0.26 + 0.18 * ( mac1.r * 0.6 + mac2.b * 0.7 );
    float wedge = vert * ( 1.0 - smoothstep( wedgeH * 0.25, wedgeH, hAbove ) );
    wedge *= wedge * ( 0.7 + 0.5 * smoothstep( 0.2, 0.8, mac2.g ) );
    wedge = clamp( wedge, 0.0, 1.0 ) * step( 1e-4, owWeatherP.z );
    alb.rgb = mix( alb.rgb, owDustCol, wedge * 0.46 );
    orm.g = clamp( orm.g + wedge * 0.07, 0.0, 1.0 );
    orm.b *= 1.0 - wedge * 0.9;
    // dust is loose powder: kill the sharp tile relief inside the wedge
    nShade = normalize( mix( nShade, normalize( owP2V * owNp ), wedge * 0.45 ) );
  #endif

  // ------------------------------------------- cavity + vertex masks ----
  float cav = 1.0 - owHeightS;
  alb.rgb = mix( alb.rgb, owGrimeCol, cav * cav * owWeatherP.w );
  orm.r *= 1.0 - cav * owWeatherP.w * 0.5;

  #ifdef OW_VCOL_MASKS
    // Wear is broken up by the macro noise and biased to the high points of the
    // height field, so an edge rubs through in patches rather than as a band.
    //
    // The height bias is deliberately shallow (0.55 -> 1.0, not 0 -> 1). On a
    // prop the mask is a thin band along an arris and the bias just decides
    // which grains inside that band rub through. On a large surface whose
    // height field IS its aggregate — a road, a gravel yard — a 0 -> 1 bias
    // turns the wear layer into a per-stone brightener, and since the mask is
    // painted over the whole plane every stone crown in the frame lights up.
    // That was most of the road's salt-and-pepper histogram.
    float wearN = smoothstep( 0.25, 0.85, mac1.b * 0.65 + mac2.a * 0.55 );
    float wearM = vColor.r * owWearP.x * ( 0.55 + 0.45 * smoothstep( 0.30, 0.80, owHeightS ) )
                * ( 0.25 + 1.15 * wearN );
    wearM = clamp( wearM, 0.0, 1.0 );
    alb.rgb = mix( alb.rgb, owWearCol, wearM * owWearMat.w );
    orm.g = mix( orm.g, owWearMat.x, wearM );
    orm.b = mix( orm.b, owWearMat.y, wearM );
    float grimeM = vColor.g * owWearP.y * ( 0.35 + 0.65 * cav ) * ( 0.45 + 0.9 * mac2.g );
    alb.rgb = mix( alb.rgb, owGrimeCol, grimeM * 0.8 );
    orm.g = clamp( orm.g + grimeM * 0.22, 0.0, 1.0 );
    orm.b *= 1.0 - grimeM * 0.8;
    orm.r *= 1.0 - vColor.b * owWearP.z;
  #endif

  #ifdef OW_CLOTH
    // The underside of a stretched canopy is never the same value as its top: it
    // sits in its own shadow, it collects soot off the street, and the only sun
    // that reaches it comes through the weave. Matching the two values is what
    // makes fabric read as painted card with a knife edge.
    float owDown = smoothstep( 0.10, -0.70, owNw.y );
    alb.rgb *= mix( 1.0, owClothP.y, owDown );
    orm.g = clamp( orm.g + owDown * 0.05, 0.0, 1.0 );
    // 8-14 cm drape structure. The tile carries the weave and the camo blotches
    // but nothing at the scale of a fold, so the shading normal is tilted by the
    // gradient of the macro band — the cloth then catches the sun in ridges.
    if ( owClothP.z > 0.0 ) {
      vec2 fUv = vec2( vOwWPos.x + vOwWPos.z * 0.63, vOwWPos.y * 0.7 + vOwWPos.z * 0.4 ) * 3.4;
      float f0 = texture2D( owMacroTex, fUv ).b;
      float fx = texture2D( owMacroTex, fUv + vec2( 0.05, 0.0 ) ).b;
      float fy = texture2D( owMacroTex, fUv + vec2( 0.0, 0.05 ) ).b;
      vec3 tiltC = vec3( -( fx - f0 ), -( fy - f0 ), 0.0 ) * owClothP.z * 9.0;
      nShade = normalize( nShade + vec3( tiltC.x, tiltC.y, 0.0 ) );
      alb.rgb *= 1.0 - ( f0 - 0.5 ) * owClothP.z * 0.9;
    }
  #endif

  // ------------------------------------------------------------ tint ----
  alb.rgb *= owTintCol;
  // owRoughP.w is a per-surface floor: tile, glass and painted metal must stay
  // glossy enough to actually catch a highlight.
  orm.g = clamp( orm.g * owRoughP.x + owRoughP.y, max( owRoughP.w, 0.015 ), 1.0 );

  owAlbedo = alb;
  owORM = orm;
  owNormalV = nShade;
}

diffuseColor.rgb *= owAlbedo.rgb;
#ifdef OW_ALPHA_MASK
  diffuseColor.a *= owAlbedo.a;
#endif
`;

/**
 * Fabric transmission.
 *
 * A sunlit canvas awning is not opaque: 15-25% of the beam comes through it, so
 * from underneath you see a glowing sheet whose folds read as density and whose
 * edge is bright. That single term is most of what makes cloth read as cloth
 * rather than as painted card.
 *
 * It sums over every directional light rather than reusing `directLight` (which
 * after the loop holds whichever light was added *last* — the moon, here), and
 * it is occluded by the baked cavity/AO term so a canopy inside an arcade does
 * not glow.
 */
const CLOTH_LIGHT = /* glsl */ `
#if defined( OW_CLOTH ) && ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
{
  vec3 owTrans = vec3( 0.0 );
  OW_CLOTH_LIGHT( 0 )
  #if NUM_DIR_LIGHTS > 1
    OW_CLOTH_LIGHT( 1 )
  #endif
  #if NUM_DIR_LIGHTS > 2
    OW_CLOTH_LIGHT( 2 )
  #endif
  reflectedLight.directDiffuse += owTrans * diffuseColor.rgb
    * ( owClothP.x * clamp( owORM.r, 0.0, 1.0 ) );
}
#endif
`;

/** Chunk overrides applied after the main injection. */
const OVERRIDES = [
  ['#include <color_fragment>', '// vertex colours are masks here, see OW_VCOL_MASKS'],
  ['#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + CLOTH_LIGHT],
  ['#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * owORM.g;'],
  ['#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * owORM.b;'],
  ['#include <normal_fragment_maps>', 'normal = owNormalV;'],
  [
    '#include <aomap_fragment>',
    /* glsl */ `
    {
      float ambientOcclusion = ( owORM.r - 1.0 ) * owAoAmt + 1.0;
      reflectedLight.indirectDiffuse *= ambientOcclusion;
      #if defined( USE_CLEARCOAT )
        clearcoatSpecularIndirect *= ambientOcclusion;
      #endif
      #if defined( USE_SHEEN )
        sheenSpecularIndirect *= ambientOcclusion;
      #endif
      #if defined( USE_ENVMAP ) && defined( STANDARD )
        // Specular occlusion on top of an already AO-heavy cavity map wipes out
        // every glint on detailed geometry, so it only gets 60% of the term.
        float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
        float aoSpec = mix( 1.0, clamp( ambientOcclusion, 0.0, 1.0 ), 0.6 );
        reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, aoSpec, material.roughness );
      #endif
    }`,
  ],
];

export const DEFAULT_PARAMS = {
  /** 'planar' (world dominant axis) | 'triplanar' | 'mesh' */
  uvMode: 'planar',
  /** project in the object's local space instead of world space */
  localSpace: false,
  /** metres per texture tile */
  scale: 2,
  /** uv offset */
  offset: [0, 0],
  /** parallax depth in metres; 0 disables */
  parallax: 0,
  parallaxFade: [6, 14],
  parallaxLayers: 22,
  /** detail layer: tiles-per-base-tile, normal strength, albedo strength, fade metres */
  detail: [11, 0.55, 0.35, 16],
  /**
   * Metres the shared detail tile should span in the world.
   *
   * detail[0] is expressed *per base tile*, which silently ties the micro
   * layer's world scale to the macro layer's. A prop-scale variant such as
   * `wood_prop` (scale 0.55 m) with detail[0] = 10 was mapping the 0.25 m
   * detail bake into 55 mm — every 1.6 mm grain became 0.35 mm, i.e. under one
   * pixel at 0.5 m, so the entire micro layer filtered away to nothing and
   * every prop read as flat colour up close. That is measurable: cranking
   * detail[2] from 0.42 to 2.5 on the market stall changed the frame by
   * nothing at all.
   *
   * So detail[0] is now DERIVED from `scale` unless this is set to 0, which
   * keeps the micro tooth at a fixed physical size no matter how the surface
   * is mapped. 0.26 m matches the bake's authored worldSize of 0.25 m.
   */
  detailWorld: 0.26,
  /** macro: world scale, albedo strength, roughness strength, hue strength */
  macro: [0.045, 0.35, 0.1, 0.35],
  /**
   * Macro contrast expansion plus a second, much larger band:
   * [ contrast, bigAmplitude, bigWorldScale, unused ]. 1/bigWorldScale is the
   * period of the macro texture in metres, and its coarsest band is a third of
   * that — so 0.028 gives ~12 m features.
   */
  macroBig: [1, 0, 0.03, 0],
  /**
   * Repair patches on vertical faces: [ coverage 0..1, cell metres,
   * albedo delta, roughness delta ]. 0 coverage disables the layer.
   */
  patch: [0, 2.6, 0.12, -0.08],
  /**
   * Fabric: [ transmission 0..1, underside albedo multiplier, fold amount,
   * unused ]. transmission 0 and multiplier 1 disable the whole cloth layer.
   */
  cloth: [0, 1, 0, 0],
  /** macro-gradient normal tilt on up-facing surfaces (ruts / drifts); 0 = off */
  macroRelief: 0,
  /** de-tiling second-sample blend amount (0 disables the extra fetches) */
  detile: 0,
  /** weathering: dust, rain streaks, ground-splash height, cavity grime */
  weather: [0.35, 0.3, 0.55, 0.4],
  groundY: 0,
  /** vertex-colour masks: wear, grime, extra AO, unused */
  wear: [0.5, 0.7, 0.5, 0],
  /**
   * [ roughness, METALNESS, unused, tint amount ] where the wear mask is 1.
   *
   * The metalness used to default to 0.5, so every worn edge on concrete,
   * plaster, brick, timber, hessian and the road turned half metal and picked
   * up a specular tint it has no business having. Only the metal library
   * entries — which set their own wearMaterial — should ever raise this.
   */
  wearMaterial: [0.42, 0.0, 0, 0.5],
  wearColor: 0x8d8b86,
  dustColor: 0x6b6154,
  grimeColor: 0x2a2620,
  rustColor: 0x6d3a1c,
  tint: 0xffffff,
  normalStrength: 1,
  /** roughness [ scale, offset, minimum ] */
  roughness: [1, 0, 0.06],
  aoStrength: 1,
  alphaMask: false,
  vertexMasks: false,
  noGrad: false,
};

/** THREE.Color already converts hex (sRGB) into the linear working space. */
function col(v) {
  return v instanceof THREE.Color ? v.clone() : new THREE.Color(v);
}

/**
 * Install the extension on a material.
 * @param {THREE.MeshStandardMaterial} material
 * @param {object} p        merged parameters (see DEFAULT_PARAMS)
 * @param {object} shared   { detailNormal, macro }
 */
export function extendMaterial(material, p, shared) {
  // Mesh-UV mode treats `scale` as a repeat count; projected modes treat it as
  // metres per tile.
  const tileScale = p.uvMode === 'mesh' ? p.scale : 1 / p.scale;

  /**
   * Keep the micro tooth at a fixed size in metres (see DEFAULT_PARAMS.detailWorld).
   *
   * Only for surfaces mapped at 0.3 m or coarser — i.e. architecture, ground
   * and world props. A viewmodel part is mapped at 0.02-0.12 m and wants its
   * detail an order of magnitude finer than a wall's; forcing 0.26 m on it
   * would put a 2 mm aggregate tooth on a bolt carrier.
   */
  const dw = p.detailWorld ?? DEFAULT_PARAMS.detailWorld;
  const detailTiles =
    p.uvMode === 'mesh' || !(dw > 0) || p.scale < 0.3
      ? p.detail[0]
      : Math.max(1.2, p.scale / dw);

  const u = {
    owDetailNrm: { value: shared.detailNormal },
    owDetailTex: { value: shared.detailAlbedo ?? shared.detailNormal },
    owMacroTex: { value: shared.macro },
    owTile: { value: new THREE.Vector4(tileScale, tileScale, p.offset[0], p.offset[1]) },
    owDetailP: {
      value: new THREE.Vector4(detailTiles, p.detail[1], p.detail[2], p.detail[3]),
    },
    owMacroP: { value: new THREE.Vector4(...p.macro) },
    owMacroBig: { value: new THREE.Vector4(...(p.macroBig ?? DEFAULT_PARAMS.macroBig)) },
    owPatchP: { value: new THREE.Vector4(...(p.patch ?? DEFAULT_PARAMS.patch)) },
    owClothP: { value: new THREE.Vector4(...(p.cloth ?? DEFAULT_PARAMS.cloth)) },
    owParallaxP: {
      value: new THREE.Vector4(p.parallax, p.parallaxFade[0], p.parallaxFade[1], p.parallaxLayers),
    },
    owWeatherP: { value: new THREE.Vector4(...p.weather) },
    owWearP: { value: new THREE.Vector4(...p.wear) },
    owTintCol: { value: col(p.tint) },
    owDustCol: { value: col(p.dustColor) },
    owGrimeCol: { value: col(p.grimeColor) },
    owRustCol: { value: col(p.rustColor ?? DEFAULT_PARAMS.rustColor) },
    owWearCol: { value: col(p.wearColor) },
    owWearMat: { value: new THREE.Vector4(...p.wearMaterial) },
    owRoughP: {
      value: new THREE.Vector4(
        p.roughness[0],
        p.roughness[1],
        p.detile,
        p.roughness[2] ?? DEFAULT_PARAMS.roughness[2]
      ),
    },
    owNormalAmp: { value: p.normalStrength },
    owGroundY: { value: p.groundY },
    owAoAmt: { value: p.aoStrength },
    owMacroRelief: { value: p.macroRelief ?? 0 },
  };

  const defines = {};
  if (p.uvMode === 'triplanar') defines.OW_TRIPLANAR = '';
  else if (p.uvMode === 'mesh') defines.OW_MESH_UV = '';
  if (p.localSpace) defines.OW_OBJECT_SPACE = '';
  if (p.parallax > 0 && p.uvMode !== 'triplanar') defines.OW_PARALLAX = '';
  if (p.detile > 0 && p.uvMode !== 'triplanar') defines.OW_DETILE = '';
  if (p.weather[0] > 0 || p.weather[1] > 0 || p.weather[2] > 0) defines.OW_WEATHER = '';
  if ((p.patch?.[0] ?? 0) > 0) defines.OW_PATCH = '';
  if ((p.cloth?.[0] ?? 0) > 0 || (p.cloth?.[1] ?? 1) < 1) defines.OW_CLOTH = '';
  if ((p.macroRelief ?? 0) > 0) defines.OW_MACRO_RELIEF = '';
  if (p.vertexMasks) defines.OW_VCOL_MASKS = '';
  if (p.alphaMask) defines.OW_ALPHA_MASK = '';
  if (p.noGrad) defines.OW_NOGRAD = '';

  Object.assign(material.defines ?? (material.defines = {}), defines);
  material.userData.owUniforms = u;
  material.userData.owParams = p;

  const key = Object.keys(defines).sort().join('|');
  material.customProgramCacheKey = () => 'ow:' + key;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + PARS_VERTEX)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + MAIN_VERTEX);

    // The pars block must land *after* three has declared map / normalMap /
    // roughnessMap, so it hooks the last pars include rather than <common>.
    let fs = shader.fragmentShader
      .replace(
        '#include <clipping_planes_pars_fragment>',
        '#include <clipping_planes_pars_fragment>\n' + PARS_FRAGMENT
      )
      .replace('#include <map_fragment>', MAIN_FRAGMENT);

    for (const [find, repl] of OVERRIDES) fs = fs.replace(find, repl);
    shader.fragmentShader = fs;
  };

  material.needsUpdate = true;
  return material;
}
