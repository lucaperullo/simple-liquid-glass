import { buildProgram, type Program } from './glProgram';
import type { MaterialSpec } from './materials';
import {
  MAX_SHAPES,
  SHAPE_BOX,
  SHAPE_STRIDE,
  SPRING_STRIDE,
  type BackdropFrame,
  type GlassCanvas,
  type LayerStatus,
  type Rect,
  type ShapeBatch,
} from './scene';
import { SpringBank, keepInside } from './springs';

/** Shape counts a program is compiled for; a layer uses the smallest that holds its shapes. */
const CAPACITIES = [4, 8, MAX_SHAPES] as const;

const CONTEXT_OPTIONS: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  powerPreference: 'high-performance',
};

/** `getContext` as both kinds of canvas offer it; their overloads do not unify on the union. */
interface ContextSource {
  getContext(kind: 'webgl', options: WebGLContextAttributes): WebGLRenderingContext | null;
}

/** What a layer tells its renderer. */
export interface LayerEvents {
  status(status: Exclude<LayerStatus, 'pending'>, detail: string): void;
  /** Something changed outside a message (a restored context): draw again. */
  wake(): void;
}

/**
 * One canvas and everything drawn into it. The layer owns the canvas's WebGL context and draws straight
 * into it: a frame is never rendered elsewhere and copied over, which costs more than the glass itself on
 * a phone once several canvases are involved.
 */
export class GlassLayer {
  readonly springs = new SpringBank(MAX_SHAPES * SHAPE_STRIDE);
  /** Set when something other than a moving spring changed what the layer shows. */
  dirty = true;

  private readonly gl: WebGLRenderingContext | null;
  private readonly programs = new Map<string, Program>();
  private current: Program | null = null;
  /** `params`, cut into one view per uniform of the material. */
  private paramViews: Float32Array[] = [];
  /** Two triangles around each shape: the only pixels the layer shades. */
  private readonly corners = new Float32Array(MAX_SHAPES * 12);
  private texture: WebGLTexture | null = null;
  /** Kept after upload so the texture can be rebuilt when a lost context comes back. */
  private frame: BackdropFrame | null = null;
  private backdropRect: Rect = { left: 0, top: 0, width: 1, height: 1 };
  private backdropFixed = true;
  private readonly ids = new Uint32Array(MAX_SHAPES);
  private count = 0;
  readonly boxes = new Float32Array(MAX_SHAPES * 4);
  readonly radii = new Float32Array(MAX_SHAPES);
  /** Each shape's eight attributes, as the two `vec4`s a material reads. */
  readonly attributesA = new Float32Array(MAX_SHAPES * 4);
  readonly attributesB = new Float32Array(MAX_SHAPES * 4);
  private usable = false;

  constructor(
    private readonly canvas: GlassCanvas,
    private view: Rect,
    private fixed: boolean,
    private scale: number,
    private material: MaterialSpec,
    private params: Float32Array,
    private lean: boolean,
    private readonly events: LayerEvents,
  ) {
    this.cutParams();
    this.sizeCanvas();
    this.gl = (canvas as ContextSource).getContext('webgl', CONTEXT_OPTIONS);
    if (!this.gl) {
      events.status('unsupported', 'WebGL is not available for this canvas');
      return;
    }
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    this.prepare(this.gl);
    this.usable = true;
    events.status('drawing', '');
  }

  /** Whether a scroll changes the picture: the layer and its backdrop do not move together. */
  get followsScroll(): boolean {
    return this.fixed !== this.backdropFixed;
  }

  setView(view: Rect, fixed: boolean, scale: number): void {
    this.view = view;
    this.fixed = fixed;
    this.scale = scale;
    this.sizeCanvas();
    this.dirty = true;
  }

  setMaterial(material: MaterialSpec, params: Float32Array, lean: boolean): void {
    this.material = material;
    this.params = params;
    this.lean = lean;
    this.cutParams();
    this.dirty = true;
  }

  /** Takes ownership of `frame`. */
  /** A new picture and where it is; or, with no picture, a new place for the one already here. */
  setBackdrop(frame: BackdropFrame | null, rect: Rect, fixed: boolean): void {
    this.backdropRect = rect;
    this.backdropFixed = fixed;
    this.dirty = true;
    if (!frame) return;
    this.frame?.close();
    this.frame = frame;
    if (this.gl && this.usable) this.upload(this.gl, frame);
  }

  /** Walls the shapes may not pass while they move, as of `time`. Null: none. */
  setBounds(bounds: Rect | null, time: number): void {
    this.springs.advanceTo(time);
    if (!bounds) {
      this.springs.constraint = null;
      return;
    }
    const { left, top } = bounds;
    const right = left + bounds.width;
    const bottom = top + bounds.height;
    this.springs.constraint = (position, velocity) => {
      for (let slot = 0; slot < this.count; slot++) {
        keepInside(position, velocity, slot * SHAPE_STRIDE, left, top, right, bottom);
      }
    };
  }

  /**
   * Adds the batch's new shapes where they are, and moves its known shapes towards their new boxes, as of
   * `time` (ms on the clock all threads share).
   */
  setShapes(batch: ShapeBatch, reducedMotion: boolean, time: number): void {
    // The change happened at `time`, not whenever this message got here: bring the springs to that moment first.
    this.springs.advanceTo(time);
    for (let i = 0; i < batch.ids.length; i++) {
      const id = batch.ids[i] ?? 0;
      let slot = this.ids.subarray(0, this.count).indexOf(id);
      const isNew = slot < 0;
      if (isNew) {
        if (this.count === MAX_SHAPES) continue;
        slot = this.count++;
        this.ids[slot] = id;
      }
      const stiffness = isNew || reducedMotion ? 0 : (batch.springs[i * SPRING_STRIDE] ?? 0);
      const damping = batch.springs[i * SPRING_STRIDE + 1] ?? 0;
      for (let k = 0; k < SHAPE_STRIDE; k++) {
        this.springs.aim(
          slot * SHAPE_STRIDE + k,
          batch.values[i * SHAPE_STRIDE + k] ?? 0,
          stiffness,
          damping,
        );
      }
    }
    this.dirty = true;
  }

  removeShapes(ids: Uint32Array): void {
    for (const id of ids) {
      const slot = this.ids.subarray(0, this.count).indexOf(id);
      if (slot < 0) continue;
      // Shapes keep their order: a material's `combine` runs over them in sequence, so a reorder could show.
      this.ids.copyWithin(slot, slot + 1, this.count);
      this.springs.remove(slot * SHAPE_STRIDE, SHAPE_STRIDE);
      this.count--;
    }
    this.dirty = true;
  }

  /** Draws the layer with the page scrolled to (`scrollX`, `scrollY`). */
  draw(scrollX: number, scrollY: number): void {
    this.dirty = false;
    const gl = this.gl;
    if (!gl || !this.usable) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // Everything outside the shapes' rectangles is empty: cleared here, never shaded.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const program = this.count > 0 ? this.program(gl) : null;
    if (!program) return;

    const { view, material, backdropRect, boxes, radii, attributesA, attributesB, corners } = this;
    const values = this.springs.value;
    // A rectangle reaches as far past its shape as the material can paint, plus the outline's antialiasing.
    const reach = material.bleed + Math.max(1, 1 / this.scale);
    for (let slot = 0; slot < this.count; slot++) {
      const from = slot * SHAPE_STRIDE;
      const x = values[from] ?? 0;
      const y = values[from + 1] ?? 0;
      const halfWidth = Math.max(values[from + 2] ?? 0, 0);
      const halfHeight = Math.max(values[from + 3] ?? 0, 0);
      const to = slot * 4;
      boxes[to] = x;
      boxes[to + 1] = y;
      boxes[to + 2] = halfWidth;
      boxes[to + 3] = halfHeight;
      radii[slot] = Math.min(Math.max(values[from + 4] ?? 0, 0), halfWidth, halfHeight);
      for (let k = 0; k < 4; k++) {
        attributesA[to + k] = values[from + SHAPE_BOX + k] ?? 0;
        attributesB[to + k] = values[from + SHAPE_BOX + 4 + k] ?? 0;
      }

      // The rectangle in clip space (y up), as two triangles.
      const left = ((x - halfWidth - reach) / view.width) * 2 - 1;
      const right = ((x + halfWidth + reach) / view.width) * 2 - 1;
      const top = 1 - ((y - halfHeight - reach) / view.height) * 2;
      const bottom = 1 - ((y + halfHeight + reach) / view.height) * 2;
      const at = slot * 12;
      corners[at] = left;
      corners[at + 1] = top;
      corners[at + 2] = right;
      corners[at + 3] = top;
      corners[at + 4] = left;
      corners[at + 5] = bottom;
      corners[at + 6] = left;
      corners[at + 7] = bottom;
      corners[at + 8] = right;
      corners[at + 9] = top;
      corners[at + 10] = right;
      corners[at + 11] = bottom;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, corners);

    const { uniforms } = program;
    gl.uniform2f(uniforms.uPixels, this.canvas.width, this.canvas.height);
    gl.uniform4f(
      uniforms.uView,
      this.fixed ? view.left : view.left - scrollX,
      this.fixed ? view.top : view.top - scrollY,
      view.width,
      view.height,
    );
    gl.uniform1f(uniforms.uScale, this.scale);
    gl.uniform1i(uniforms.uCount, this.count);
    gl.uniform4fv(uniforms.uBox, program.boxes);
    gl.uniform1fv(uniforms.uRadius, program.radii);
    // (A material that reads no attributes has no such uniforms; setting a null location does nothing.)
    gl.uniform4fv(uniforms.uAttributesA, program.attributesA);
    gl.uniform4fv(uniforms.uAttributesB, program.attributesB);
    gl.uniform1f(uniforms.uHasBackdrop, this.texture ? 1 : 0);
    gl.uniform4f(
      uniforms.uBackdropRect,
      this.backdropFixed ? backdropRect.left : backdropRect.left - scrollX,
      this.backdropFixed ? backdropRect.top : backdropRect.top - scrollY,
      backdropRect.width,
      backdropRect.height,
    );
    for (let i = 0; i < this.paramViews.length; i++) {
      const value = this.paramViews[i];
      const location = program.parameters[i];
      if (!value || !location) continue;
      if (value.length === 1) gl.uniform1fv(location, value);
      else if (value.length === 2) gl.uniform2fv(location, value);
      else if (value.length === 3) gl.uniform3fv(location, value);
      else gl.uniform4fv(location, value);
    }
    gl.drawArrays(gl.TRIANGLES, 0, this.count * 6);
  }

  /** Test aid: loses the context, and restores it `restoreAfter` ms later. */
  loseContext(restoreAfter: number): void {
    const extension = this.gl?.getExtension('WEBGL_lose_context');
    if (!extension) return;
    extension.loseContext();
    setTimeout(() => {
      extension.restoreContext();
    }, restoreAfter);
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.usable = false;
    this.frame?.close();
    this.frame = null;
    // Frees the GPU memory now instead of when the canvas is collected.
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private readonly onLost = (event: Event): void => {
    // Without this the browser never restores the context.
    event.preventDefault();
    this.usable = false;
    this.events.status('context-lost', '');
  };

  private readonly onRestored = (): void => {
    if (!this.gl) return;
    this.programs.clear();
    this.current = null;
    this.texture = null;
    this.prepare(this.gl);
    if (this.frame) this.upload(this.gl, this.frame);
    this.usable = true;
    this.dirty = true;
    this.events.status('drawing', '');
    this.events.wake();
  };

  private sizeCanvas(): void {
    this.canvas.width = Math.max(Math.round(this.view.width * this.scale), 1);
    this.canvas.height = Math.max(Math.round(this.view.height * this.scale), 1);
  }

  /** State that lives in the context and is lost with it. */
  private prepare(gl: WebGLRenderingContext): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, this.corners, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // The shader writes premultiplied colour for every pixel; nothing is blended inside the canvas.
    gl.disable(gl.BLEND);
  }

  private upload(gl: WebGLRenderingContext, frame: BackdropFrame): void {
    // One texture for the layer's life: a stream of frames refills it instead of making a new one each time.
    if (!this.texture) {
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
  }

  private cutParams(): void {
    this.paramViews = this.material.uniforms.map(({ offset, size }) =>
      this.params.subarray(offset, offset + size),
    );
  }

  /** The program for the layer's material and shape count, in use. Null (and the layer unsupported) if it fails to build. */
  private program(gl: WebGLRenderingContext): Program | null {
    const capacity = CAPACITIES.find((size) => size >= this.count) ?? MAX_SHAPES;
    const { material, lean, current } = this;
    if (current?.material === material && current.capacity === capacity && current.lean === lean)
      return current;

    const key = `${material.id}/${capacity}/${lean ? 'lean' : 'full'}`;
    let program = this.programs.get(key);
    if (!program) {
      try {
        program = buildProgram(gl, material, capacity, lean, this);
      } catch (error) {
        // A context lost mid-build fails the same way; that is reported, and recovered from, by its own event.
        if (gl.isContextLost()) return null;
        this.usable = false;
        this.events.status('unsupported', error instanceof Error ? error.message : String(error));
        return null;
      }
      this.programs.set(key, program);
    }
    gl.useProgram(program.handle);
    gl.uniform1i(program.uniforms.uBackdrop, 0);
    this.current = program;
    return program;
  }
}
