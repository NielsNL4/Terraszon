import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from 'maplibre-gl';
import { MIN_SUN_ALTITUDE, SHADOW_VERTEX_STRIDE } from './shadows';
import type { ShadowMesh } from './types';

type GL = WebGLRenderingContext | WebGL2RenderingContext;

const MAX_MASK_SIZE = 1_024;
const VERTEX_BYTES = SHADOW_VERTEX_STRIDE * Float32Array.BYTES_PER_ELEMENT;

const MASK_VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute float a_heightMercator;
  attribute float a_maxShadowMercator;
  attribute float a_projected;
  uniform mat4 u_matrix;
  uniform vec2 u_shadowDirection;
  uniform float u_cotAltitude;

  void main() {
    float shadowLength = min(a_heightMercator * u_cotAltitude, a_maxShadowMercator);
    vec2 position = a_position + u_shadowDirection * shadowLength * a_projected;
    gl_Position = u_matrix * vec4(position, 0.0, 1.0);
  }
`;

const MASK_FRAGMENT_SHADER = `
  precision mediump float;

  void main() {
    gl_FragColor = vec4(1.0);
  }
`;

const COMPOSITE_VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    v_texCoord = a_texCoord;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const COMPOSITE_FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_mask;
  uniform vec4 u_color;
  varying vec2 v_texCoord;

  void main() {
    float alpha = texture2D(u_mask, v_texCoord).a * u_color.a;
    if (alpha < 0.001) discard;
    gl_FragColor = vec4(u_color.rgb * alpha, alpha);
  }
`;

function createProgram(gl: GL, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vertexShader || !fragmentShader || !program) throw new Error('WebGL-resources konden niet worden gemaakt');

  gl.shaderSource(vertexShader, vertexSource);
  gl.shaderSource(fragmentShader, fragmentSource);
  gl.compileShader(vertexShader);
  gl.compileShader(fragmentShader);
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.bindAttribLocation(program, 0, 'a_position');
  gl.linkProgram(program);
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS) as boolean;
  const details = linked ? '' : [
    gl.getShaderInfoLog(vertexShader),
    gl.getShaderInfoLog(fragmentShader),
    gl.getProgramInfoLog(program),
  ].filter(Boolean).join('\n');
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!linked) {
    gl.deleteProgram(program);
    throw new Error(details || 'WebGL-shaders konden niet worden gekoppeld');
  }
  return program;
}

function requiredAttribute(gl: GL, program: WebGLProgram, name: string): number {
  const location = gl.getAttribLocation(program, name);
  if (location < 0) throw new Error(`WebGL-attribuut ontbreekt: ${name}`);
  return location;
}

function requiredUniform(gl: GL, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new Error(`WebGL-uniform ontbreekt: ${name}`);
  return location;
}

function matrixAtOrigin(matrix: ArrayLike<number>, origin: [number, number]): Float32Array {
  const result = new Float32Array(matrix);
  const [x, y] = origin;
  result[12] = matrix[0] * x + matrix[4] * y + matrix[12];
  result[13] = matrix[1] * x + matrix[5] * y + matrix[13];
  result[14] = matrix[2] * x + matrix[6] * y + matrix[14];
  result[15] = matrix[3] * x + matrix[7] * y + matrix[15];
  return result;
}

export class BuildingShadowLayer implements CustomLayerInterface {
  readonly id = 'terraszon-shadows';
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  private map?: MapLibreMap;
  private mesh: ShadowMesh = { origin: [0, 0], vertices: new Float32Array() };
  private meshPending = true;
  private vertexCount = 0;
  private daylight = false;
  private shadowDirection: [number, number] = [0, 0];
  private cotAltitude = 0;
  private failed = false;
  private maskWidth = 0;
  private maskHeight = 0;

  private maskProgram?: WebGLProgram;
  private compositeProgram?: WebGLProgram;
  private meshBuffer?: WebGLBuffer;
  private quadBuffer?: WebGLBuffer;
  private maskTexture?: WebGLTexture;
  private framebuffer?: WebGLFramebuffer;

  private maskLocations?: {
    position: number;
    height: number;
    maxShadow: number;
    projected: number;
    matrix: WebGLUniformLocation;
    direction: WebGLUniformLocation;
    cotAltitude: WebGLUniformLocation;
  };

  private compositeLocations?: {
    position: number;
    texCoord: number;
    mask: WebGLUniformLocation;
    color: WebGLUniformLocation;
  };

  constructor(private readonly onError: (message: string) => void) {}

  setMesh(mesh: ShadowMesh): void {
    this.mesh = mesh;
    this.meshPending = true;
    this.map?.triggerRepaint();
  }

  setSun(altitude: number, azimuth: number, daylight: boolean): void {
    this.daylight = daylight && altitude > 0;
    if (this.daylight) {
      const altitudeRadians = Math.max(altitude, MIN_SUN_ALTITUDE) * Math.PI / 180;
      const shadowBearing = (azimuth + 180) * Math.PI / 180;
      this.cotAltitude = 1 / Math.tan(altitudeRadians);
      this.shadowDirection = [Math.sin(shadowBearing), -Math.cos(shadowBearing)];
    }
    this.map?.triggerRepaint();
  }

  onAdd(map: MapLibreMap, gl: GL): void {
    this.map = map;

    try {
      this.maskProgram = createProgram(gl, MASK_VERTEX_SHADER, MASK_FRAGMENT_SHADER);
      this.compositeProgram = createProgram(gl, COMPOSITE_VERTEX_SHADER, COMPOSITE_FRAGMENT_SHADER);
      this.meshBuffer = gl.createBuffer() ?? undefined;
      this.quadBuffer = gl.createBuffer() ?? undefined;
      this.maskTexture = gl.createTexture() ?? undefined;
      this.framebuffer = gl.createFramebuffer() ?? undefined;
      if (!this.meshBuffer || !this.quadBuffer || !this.maskTexture || !this.framebuffer) {
        throw new Error('WebGL-buffers konden niet worden gemaakt');
      }

      this.maskLocations = {
        position: requiredAttribute(gl, this.maskProgram, 'a_position'),
        height: requiredAttribute(gl, this.maskProgram, 'a_heightMercator'),
        maxShadow: requiredAttribute(gl, this.maskProgram, 'a_maxShadowMercator'),
        projected: requiredAttribute(gl, this.maskProgram, 'a_projected'),
        matrix: requiredUniform(gl, this.maskProgram, 'u_matrix'),
        direction: requiredUniform(gl, this.maskProgram, 'u_shadowDirection'),
        cotAltitude: requiredUniform(gl, this.maskProgram, 'u_cotAltitude'),
      };
      this.compositeLocations = {
        position: requiredAttribute(gl, this.compositeProgram, 'a_position'),
        texCoord: requiredAttribute(gl, this.compositeProgram, 'a_texCoord'),
        mask: requiredUniform(gl, this.compositeProgram, 'u_mask'),
        color: requiredUniform(gl, this.compositeProgram, 'u_color'),
      };

      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 0, 0,
        1, -1, 1, 0,
        -1, 1, 0, 1,
        1, 1, 1, 1,
      ]), gl.STATIC_DRAW);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.maskTexture,
        0,
      );
      this.meshPending = true;
    } catch (error) {
      this.fail(error);
    }
  }

  prerender(gl: GL, options: CustomRenderMethodInput): void {
    if (this.failed || !this.daylight || !this.resourcesReady()) return;
    this.uploadMesh(gl);
    if (this.vertexCount === 0 || !this.ensureMaskSize(gl)) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer!);
    gl.viewport(0, 0, this.maskWidth, this.maskHeight);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);
    gl.depthMask(false);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const locations = this.maskLocations!;
    gl.useProgram(this.maskProgram!);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuffer!);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, VERTEX_BYTES, 0);
    gl.enableVertexAttribArray(locations.height);
    gl.vertexAttribPointer(locations.height, 1, gl.FLOAT, false, VERTEX_BYTES, 8);
    gl.enableVertexAttribArray(locations.maxShadow);
    gl.vertexAttribPointer(locations.maxShadow, 1, gl.FLOAT, false, VERTEX_BYTES, 12);
    gl.enableVertexAttribArray(locations.projected);
    gl.vertexAttribPointer(locations.projected, 1, gl.FLOAT, false, VERTEX_BYTES, 16);
    gl.uniformMatrix4fv(
      locations.matrix,
      false,
      matrixAtOrigin(options.modelViewProjectionMatrix, this.mesh.origin),
    );
    gl.uniform2fv(locations.direction, this.shadowDirection);
    gl.uniform1f(locations.cotAltitude, this.cotAltitude);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
  }

  render(gl: GL): void {
    if (this.failed || !this.daylight || this.vertexCount === 0 || !this.resourcesReady()) return;

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.depthMask(false);
    gl.colorMask(true, true, true, true);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const locations = this.compositeLocations!;
    gl.useProgram(this.compositeProgram!);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer!);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(locations.texCoord);
    gl.vertexAttribPointer(locations.texCoord, 2, gl.FLOAT, false, 16, 8);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture!);
    gl.uniform1i(locations.mask, 0);
    gl.uniform4f(locations.color, 83 / 255, 96 / 255, 108 / 255, 0.32);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  onRemove(_map: MapLibreMap, gl: GL): void {
    if (this.maskProgram) gl.deleteProgram(this.maskProgram);
    if (this.compositeProgram) gl.deleteProgram(this.compositeProgram);
    if (this.meshBuffer) gl.deleteBuffer(this.meshBuffer);
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    if (this.maskTexture) gl.deleteTexture(this.maskTexture);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    this.map = undefined;
  }

  private resourcesReady(): boolean {
    return Boolean(
      this.maskProgram && this.compositeProgram && this.meshBuffer && this.quadBuffer
      && this.maskTexture && this.framebuffer && this.maskLocations && this.compositeLocations,
    );
  }

  private uploadMesh(gl: GL): void {
    if (!this.meshPending) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuffer!);
    gl.bufferData(gl.ARRAY_BUFFER, this.mesh.vertices, gl.STATIC_DRAW);
    this.vertexCount = this.mesh.vertices.length / SHADOW_VERTEX_STRIDE;
    this.meshPending = false;
  }

  private ensureMaskSize(gl: GL): boolean {
    const scale = Math.min(1, MAX_MASK_SIZE / Math.max(gl.drawingBufferWidth, gl.drawingBufferHeight));
    const width = Math.max(1, Math.round(gl.drawingBufferWidth * scale));
    const height = Math.max(1, Math.round(gl.drawingBufferHeight * scale));
    if (width === this.maskWidth && height === this.maskHeight) return true;

    this.maskWidth = width;
    this.maskHeight = height;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture!);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer!);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      this.fail(new Error('WebGL-schaduwbuffer is niet compleet'));
      return false;
    }
    return true;
  }

  private fail(error: unknown): void {
    if (this.failed) return;
    this.failed = true;
    const message = error instanceof Error ? error.message : 'Onbekende WebGL-fout';
    this.onError(message);
  }
}
