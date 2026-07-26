import * as THREE from 'three';
import { COMMON } from './glsl.js';

/**
 * Depth / normal / velocity prepass.
 *
 * Three MRT attachments:
 *   0  RGBA16F  octahedral view normal (xy), coverage (z), material id (w)
 *   1  RG16F    screen-space velocity as a UV delta (current - previous)
 *   2  R32F     linear view depth in metres (positive)
 *
 * Coverage is 1.0 for ordinary geometry and OW_COVERAGE_DYNAMIC (0.7) for
 * geometry whose *vertices* move independently of its transform — skinned
 * characters and morphed meshes. Every consumer only ever tests coverage
 * against 0.5, so both still read as "there is a surface here", but TAA uses the
 * distinction to reject history on exactly the pixels whose motion no
 * matrix-difference velocity can describe. Without it a running enemy's arms and
 * legs emit zero motion and the temporal filter drags the background through
 * them — the smear on the character silhouettes.
 *
 * Velocity is computed from *unjittered* view-projection matrices for both
 * frames, so the TAA jitter never leaks into the motion vectors — which is
 * the single most common reason browser TAA implementations smear.
 *
 * Per-object previous world matrices are pushed through
 * `material.onBeforeRender`, which the renderer calls once per draw; setting
 * `uniformsNeedUpdate` forces the re-upload. This is what makes the velocity
 * buffer *per object* rather than camera-only.
 */
/** Coverage written for skinned / morphed geometry. See the class note. */
export const OW_COVERAGE_DYNAMIC = 0.7;

export class GBuffer {
  constructor() {
    this.rt = null;
    this.width = 1;
    this.height = 1;
    this.prev = new Map();
    this._seen = new Set();

    this.material = new THREE.ShaderMaterial({
      name: 'ow-prepass',
      glslVersion: THREE.GLSL3,
      side: THREE.FrontSide,
      uniforms: {
        owPrevModelMatrix: { value: new THREE.Matrix4() },
        owCurrVP: { value: new THREE.Matrix4() },
        owPrevVP: { value: new THREE.Matrix4() },
        owMatId: { value: 0 },
        owCoverage: { value: 1 },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <batching_pars_vertex>
        #include <skinning_pars_vertex>
        #include <morphtarget_pars_vertex>

        uniform mat4 owPrevModelMatrix;
        uniform mat4 owCurrVP;
        uniform mat4 owPrevVP;

        varying vec3 vNrm;
        varying vec4 vCurrClip;
        varying vec4 vPrevClip;
        varying float vViewDepth;

        void main() {
          #include <batching_vertex>
          #include <beginnormal_vertex>
          #include <morphinstance_vertex>
          #include <morphnormal_vertex>
          #include <skinbase_vertex>
          #include <skinnormal_vertex>
          #include <defaultnormal_vertex>
          #include <begin_vertex>
          #include <morphtarget_vertex>
          #include <skinning_vertex>
          #include <project_vertex>

          vNrm = transformedNormal;
          vViewDepth = -mvPosition.z;

          vec4 objPos = vec4( transformed, 1.0 );
          #ifdef USE_BATCHING
            objPos = batchingMatrix * objPos;
          #endif
          #ifdef USE_INSTANCING
            objPos = instanceMatrix * objPos;
          #endif
          vCurrClip = owCurrVP * ( modelMatrix * objPos );
          vPrevClip = owPrevVP * ( owPrevModelMatrix * objPos );
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        ${COMMON}
        uniform float owMatId;
        uniform float owCoverage;

        varying vec3 vNrm;
        varying vec4 vCurrClip;
        varying vec4 vPrevClip;
        varying float vViewDepth;

        layout(location = 0) out vec4 gNormal;
        layout(location = 1) out vec4 gVelocity;
        layout(location = 2) out vec4 gDepth;

        void main() {
          vec3 n = normalize( vNrm );
          if ( !gl_FrontFacing ) n = -n;
          gNormal = vec4( owEncodeNormal( n ), owCoverage, owMatId );

          vec2 a = vCurrClip.xy / max( 1e-6, vCurrClip.w );
          vec2 b = vPrevClip.xy / max( 1e-6, vPrevClip.w );
          gVelocity = vec4( ( a - b ) * 0.5, 0.0, 0.0 );

          gDepth = vec4( vViewDepth, 0.0, 0.0, 0.0 );
        }
      `,
    });

    this.material.onBeforeRender = (renderer, scene, camera, geometry, object) => {
      const u = this.material.uniforms;
      const p = this.prev.get(object.id);
      if (p !== undefined) u.owPrevModelMatrix.value.copy(p);
      else u.owPrevModelMatrix.value.copy(object.matrixWorld);
      u.owMatId.value = object.userData !== undefined ? object.userData.owMatId || 0 : 0;
      // Skinned and morphed geometry deforms *inside* its transform, so the
      // matrix difference above describes none of the motion its pixels actually
      // have. Flag it so TAA can reject history there instead of smearing.
      u.owCoverage.value =
        object.isSkinnedMesh === true ||
        (object.morphTargetInfluences !== undefined && object.morphTargetInfluences !== null)
          ? OW_COVERAGE_DYNAMIC
          : 1;
      this.material.uniformsNeedUpdate = true;
    };
  }

  setSize(w, h) {
    w = Math.max(1, w | 0);
    h = Math.max(1, h | 0);
    if (this.rt && this.width === w && this.height === h) return;
    this.width = w;
    this.height = h;
    if (this.rt) this.rt.dispose();

    const rt = new THREE.WebGLRenderTarget(w, h, {
      count: 3,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    rt.textures[0].name = 'gb-normal';

    rt.textures[1].format = THREE.RGFormat;
    rt.textures[1].type = THREE.HalfFloatType;
    rt.textures[1].name = 'gb-velocity';

    rt.textures[2].format = THREE.RedFormat;
    rt.textures[2].type = THREE.FloatType;
    rt.textures[2].name = 'gb-depth';

    for (const t of rt.textures) {
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
    }

    this.rt = rt;
  }

  get normalTexture() {
    return this.rt.textures[0];
  }
  get velocityTexture() {
    return this.rt.textures[1];
  }
  get depthTexture() {
    return this.rt.textures[2];
  }

  /**
   * @param {boolean} clear  clear colour+depth (world pass) or depth only
   *                         (viewmodel pass, composited over the same buffer)
   */
  render(renderer, scene, camera, currVP, prevVP, clear) {
    const u = this.material.uniforms;
    u.owCurrVP.value.copy(currVP);
    u.owPrevVP.value.copy(prevVP);

    const prevOverride = scene.overrideMaterial;
    scene.overrideMaterial = this.material;
    renderer.setRenderTarget(this.rt);
    if (clear) renderer.clear(true, true, false);
    else renderer.clear(false, true, false);
    renderer.render(scene, camera);
    scene.overrideMaterial = prevOverride;
  }

  beginRecord() {
    this._seen.clear();
  }

  /** Remember this frame's transforms so next frame can difference them. */
  recordMatrices(objects, count) {
    for (let i = 0; i < count; i++) {
      const o = objects[i];
      this._seen.add(o.id);
      let m = this.prev.get(o.id);
      if (m === undefined) {
        m = new THREE.Matrix4();
        this.prev.set(o.id, m);
      }
      m.copy(o.matrixWorld);
    }
  }

  /** Drop entries for objects that went away, so the map cannot grow forever. */
  endRecord() {
    if (this.prev.size > this._seen.size * 2 + 64) {
      for (const id of this.prev.keys()) if (!this._seen.has(id)) this.prev.delete(id);
    }
  }

  dispose() {
    if (this.rt) this.rt.dispose();
    this.material.dispose();
    this.prev.clear();
  }
}
