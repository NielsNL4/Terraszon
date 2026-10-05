import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import { createProgram, isWebGL2, matrixAtOrigin, requiredAttribute, requiredUniform } from './shadow-layer';
import { MAX_SHADOW_LENGTH, MIN_SUN_ALTITUDE } from './shadows';
import { TREE_INSTANCE_STRIDE, TREE_VERTEX_STRIDE, treeInstances, treeMercator, treeMesh, type TreeInstances } from './tree-model';
import { LEAF_AMOUNT_GLSL, TREE_PROFILES, treeSeasonDay, treeDataKey, type TreeProfileId } from './tree-profiles';
import type { TreeFeature } from './types';

type GL = WebGLRenderingContext | WebGL2RenderingContext;
type Batch = { vertices: WebGLBuffer; indices: WebGLBuffer; instances: WebGLBuffer; count: number; indexCount: number };

function shaders(webgl2: boolean): [string, string] {
  const attribute = webgl2 ? 'in' : 'attribute';
  const varyingOut = webgl2 ? 'out' : 'varying';
  const varyingIn = webgl2 ? 'in' : 'varying';
  const version = webgl2 ? '#version 300 es\n' : '';
  return [`${version}
precision highp float;
${attribute} vec3 a_position;
${attribute} vec3 a_normal;
${attribute} vec3 a_color;
${attribute} float a_leaf;
${attribute} vec4 a_instance;
${attribute} vec4 a_traits;
uniform mat4 u_matrix;
uniform float u_day;
uniform float u_shadow;
uniform vec2 u_shadowDirection;
uniform float u_cotAltitude;
uniform float u_maxShadow;
${varyingOut} vec3 v_normal;
${varyingOut} vec3 v_color;
${varyingOut} vec3 v_local;
${varyingOut} float v_leaf;
${varyingOut} float v_amount;
${varyingOut} float v_seed;
${varyingOut} float v_autumn;
${LEAF_AMOUNT_GLSL}
void main() {
  mat2 rotation = mat2(a_traits.x, a_traits.y, -a_traits.y, a_traits.x);
  vec3 position = vec3(a_instance.xy + rotation * a_position.xy * a_instance.z, a_position.z * a_instance.w);
  if (u_shadow > 0.5) {
    position.xy += u_shadowDirection * min(position.z * u_cotAltitude, u_maxShadow);
    position.z = 0.0;
  }
  gl_Position = u_matrix * vec4(position, 1.0);
  v_normal = normalize(vec3(rotation * a_normal.xy / a_instance.z, a_normal.z / a_instance.w));
  v_color = a_color;
  v_local = a_position;
  v_leaf = a_leaf;
  v_amount = leafAmount(a_traits.z, u_day, a_traits.w);
  v_seed = a_traits.x * 13.0 + a_traits.y * 7.0;
  float day = mod(u_day - a_traits.w + 730.0, 365.0);
  v_autumn = smoothstep(260.0, 300.0, day) * (1.0 - v_amount);
}
`, `${version}
precision highp float;
${varyingIn} vec3 v_normal;
${varyingIn} vec3 v_color;
${varyingIn} vec3 v_local;
${varyingIn} float v_leaf;
${varyingIn} float v_amount;
${varyingIn} float v_seed;
${varyingIn} float v_autumn;
uniform vec3 u_light;
uniform float u_density;
uniform float u_shadow;
${webgl2 ? 'out vec4 fragmentColor;' : ''}
void main() {
  float coverage = v_amount * u_density;
  if (v_leaf > 0.5 && coverage < 0.01) discard;
  vec4 color;
  if (u_shadow > 0.5) {
    // A soft, indicative canopy mask; MAX blending prevents self-overdraw or
    // overlapping trees from accidentally becoming an opaque building mask.
    float opacity = v_leaf > 0.5 ? coverage * 0.8 : 0.65;
    color = vec4(opacity);
  } else {
    // Object-local cutouts remain fixed when the camera or time changes.
    vec3 cell = floor(v_local * 27.0);
    float noise = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719)) + v_seed) * 43758.5453);
    if (v_leaf > 0.5 && noise > coverage) discard;
    vec3 normal = gl_FrontFacing ? normalize(v_normal) : -normalize(v_normal);
    float light = 0.48 + 0.48 * max(0.0, dot(normal, u_light));
    vec3 autumn = vec3(0.55, 0.43, 0.2);
    vec3 surface = v_leaf > 0.5 ? mix(v_color, autumn, v_autumn) : v_color;
    color = vec4(surface * light, 1.0);
  }
  ${webgl2 ? 'fragmentColor' : 'gl_FragColor'} = color;
}`];
}

export class InstancedTreeLayer implements CustomLayerInterface {
  readonly id = 'terraszon-trees-3d';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private map?: MapLibreMap;
  private program?: WebGLProgram;
  private vao?: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null;
  private vaoExtension?: OES_vertex_array_object | null;
  private angle?: ANGLE_instanced_arrays | null;
  private maxBlend = 0;
  private batches = new Map<TreeProfileId, Batch>();
  private data: TreeInstances = { origin: [0, 0], groups: new Map() };
  private pending = true;
  private treeKey: string | null = null;
  private rebuild = false;
  private failed = false;
  private visible = true;
  private day = 181;
  private light: [number, number, number] = [0, -0.5, 0.86];
  private direction: [number, number] = [0, 1];
  private cotAltitude = 1;
  private daylight = true;
  private attributes: number[] = [];
  private uniforms?: Record<string, WebGLUniformLocation>;
  private contextRestored = () => { this.rebuild = true; this.pending = true; };

  constructor(private readonly onError: (message: string) => void) {}

  setTrees(trees: TreeFeature[]): void {
    const key = treeDataKey(trees);
    if (key === this.treeKey) return;
    this.treeKey = key;
    this.data = treeInstances(trees);
    this.pending = true;
    this.map?.triggerRepaint();
  }

  setDate(date: string): void {
    const day = treeSeasonDay(date);
    if (day === this.day) return;
    this.day = day;
    this.map?.triggerRepaint();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.map?.triggerRepaint();
  }

  setSun(altitude: number, azimuth: number, daylight: boolean): void {
    this.daylight = daylight && altitude > 0;
    const radians = Math.max(altitude, MIN_SUN_ALTITUDE) * Math.PI / 180;
    const bearing = azimuth * Math.PI / 180;
    this.light = [Math.sin(bearing) * Math.cos(radians), -Math.cos(bearing) * Math.cos(radians), Math.sin(radians)];
    this.direction = [-Math.sin(bearing), Math.cos(bearing)];
    this.cotAltitude = 1 / Math.tan(radians);
  }

  onAdd(map: MapLibreMap, gl: GL): void {
    this.map = map;
    map.off('webglcontextrestored', this.contextRestored);
    map.on('webglcontextrestored', this.contextRestored);
    this.initialize(gl);
  }

  private initialize(gl: GL): void {
    try {
      this.release(gl);
      const webgl2 = isWebGL2(gl);
      this.program = createProgram(gl, ...shaders(webgl2));
      this.angle = webgl2 ? null : gl.getExtension('ANGLE_instanced_arrays');
      this.vaoExtension = webgl2 ? null : gl.getExtension('OES_vertex_array_object');
      this.vao = webgl2 ? gl.createVertexArray() : this.vaoExtension?.createVertexArrayOES();
      this.maxBlend = webgl2 ? gl.MAX : gl.getExtension('EXT_blend_minmax')?.MAX_EXT ?? 0;
      this.attributes = ['a_position', 'a_normal', 'a_color', 'a_leaf', 'a_instance', 'a_traits']
        .map((name) => requiredAttribute(gl, this.program!, name));
      this.uniforms = Object.fromEntries(['u_matrix', 'u_day', 'u_shadow', 'u_shadowDirection',
        'u_cotAltitude', 'u_maxShadow', 'u_light', 'u_density']
        .map((name) => [name, requiredUniform(gl, this.program!, name)]));
      this.batches.clear();
      this.pending = true;
      this.rebuild = false;
      this.failed = false;
    } catch (error) {
      this.failed = true;
      this.onError(error instanceof Error ? error.message : 'GPU-bomen konden niet starten');
    }
  }

  render(gl: GL, options: CustomRenderMethodInput): void {
    if (!this.visible || !this.map || this.map.getZoom() < 15) return;
    this.draw(gl, options, false);
  }

  renderShadows(gl: GL, options: CustomRenderMethodInput): boolean {
    if (gl.isContextLost() || !this.visible || !this.daylight || !this.map || this.map.getZoom() < 14) return false;
    if (this.rebuild) this.initialize(gl);
    // A missing MAX extension must not turn translucent tree shadows opaque.
    if (!this.maxBlend) return false;
    return this.draw(gl, options, true);
  }

  private upload(gl: GL): void {
    if (!this.pending) return;
    for (const batch of this.batches.values()) batch.count = 0;
    for (const [id, instances] of this.data.groups) {
      let batch = this.batches.get(id);
      if (!batch) {
        const vertices = gl.createBuffer(), indices = gl.createBuffer(), instanceBuffer = gl.createBuffer();
        if (!vertices || !indices || !instanceBuffer) throw new Error('Boombuffers konden niet worden gemaakt');
        const mesh = treeMesh(id);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        batch = { vertices, indices, instances: instanceBuffer, count: 0, indexCount: mesh.indices.length };
        this.batches.set(id, batch);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.instances);
      gl.bufferData(gl.ARRAY_BUFFER, instances, gl.DYNAMIC_DRAW);
      batch.count = instances.length / TREE_INSTANCE_STRIDE;
    }
    this.pending = false;
  }

  private bindVao(gl: GL, bound: boolean): void {
    if (isWebGL2(gl)) gl.bindVertexArray(bound ? this.vao as WebGLVertexArrayObject : null);
    else this.vaoExtension?.bindVertexArrayOES(bound ? this.vao as WebGLVertexArrayObjectOES : null);
  }

  private divisor(gl: GL, attribute: number, value: number): void {
    if (isWebGL2(gl)) gl.vertexAttribDivisor(attribute, value);
    else this.angle?.vertexAttribDivisorANGLE(attribute, value);
  }

  private draw(gl: GL, options: CustomRenderMethodInput, shadow: boolean): boolean {
    if (gl.isContextLost()) return false;
    if (this.rebuild) this.initialize(gl);
    if (this.failed || !this.program || !this.uniforms) return false;
    this.bindVao(gl, true);
    try {
      this.upload(gl);
      gl.useProgram(this.program);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.SCISSOR_TEST);
      gl.colorMask(true, true, true, true);
      if (shadow) {
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendEquation(this.maxBlend);
        gl.blendFunc(gl.ONE, gl.ONE);
      } else {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      const u = this.uniforms;
      gl.uniformMatrix4fv(u.u_matrix, false, matrixAtOrigin(options.defaultProjectionData.mainMatrix, this.data.origin));
      gl.uniform1f(u.u_day, this.day);
      gl.uniform1f(u.u_shadow, Number(shadow));
      gl.uniform2fv(u.u_shadowDirection, this.direction);
      gl.uniform1f(u.u_cotAltitude, this.cotAltitude);
      gl.uniform1f(u.u_maxShadow, MAX_SHADOW_LENGTH * treeMercator(0, this.map!.getCenter().lat)[2]);
      gl.uniform3fv(u.u_light, this.light);
      let drew = false;
      for (const [id, batch] of this.batches) {
        if (!batch.count) continue;
        drew = true;
        gl.uniform1f(u.u_density, TREE_PROFILES[id].density);
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.vertices);
        for (let i = 0; i < 4; i++) {
          const location = this.attributes[i];
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, i === 3 ? 1 : 3, gl.FLOAT, false, TREE_VERTEX_STRIDE * 4, i * 12);
          this.divisor(gl, location, 0);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, batch.indices);
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.instances);
        if (isWebGL2(gl) || this.angle) {
          for (let i = 4; i < 6; i++) {
            gl.enableVertexAttribArray(this.attributes[i]);
            gl.vertexAttribPointer(this.attributes[i], 4, gl.FLOAT, false, TREE_INSTANCE_STRIDE * 4, (i - 4) * 16);
            this.divisor(gl, this.attributes[i], 1);
          }
          if (isWebGL2(gl)) gl.drawElementsInstanced(gl.TRIANGLES, batch.indexCount, gl.UNSIGNED_SHORT, 0, batch.count);
          else this.angle!.drawElementsInstancedANGLE(gl.TRIANGLES, batch.indexCount, gl.UNSIGNED_SHORT, 0, batch.count);
        } else {
          // Rare WebGL1 fallback still shares the mesh; it never expands it into
          // 4,000 GeoJSON volumes, but needs one regular draw per instance.
          gl.disableVertexAttribArray(this.attributes[4]);
          gl.disableVertexAttribArray(this.attributes[5]);
          const instances = this.data.groups.get(id)!;
          for (let offset = 0; offset < instances.length; offset += TREE_INSTANCE_STRIDE) {
            gl.vertexAttrib4fv(this.attributes[4], instances.subarray(offset, offset + 4));
            gl.vertexAttrib4fv(this.attributes[5], instances.subarray(offset + 4, offset + 8));
            gl.drawElements(gl.TRIANGLES, batch.indexCount, gl.UNSIGNED_SHORT, 0);
          }
        }
      }
      return drew;
    } catch (error) {
      this.failed = true;
      this.onError(error instanceof Error ? error.message : 'GPU-bomen konden niet tekenen');
      return false;
    } finally {
      for (const attribute of this.attributes) this.divisor(gl, attribute, 0);
      this.bindVao(gl, false);
      gl.blendEquation(gl.FUNC_ADD);
    }
  }

  onRemove(map: MapLibreMap, gl: GL): void {
    map.off('webglcontextrestored', this.contextRestored);
    this.release(gl);
    this.map = undefined;
  }

  private release(gl: GL): void {
    if (this.program) gl.deleteProgram(this.program);
    for (const batch of this.batches.values()) {
      gl.deleteBuffer(batch.vertices);
      gl.deleteBuffer(batch.indices);
      gl.deleteBuffer(batch.instances);
    }
    if (isWebGL2(gl) && this.vao) gl.deleteVertexArray(this.vao as WebGLVertexArrayObject);
    else if (this.vao) this.vaoExtension?.deleteVertexArrayOES(this.vao as WebGLVertexArrayObjectOES);
    this.batches.clear();
    this.program = undefined;
    this.vao = undefined;
  }
}
