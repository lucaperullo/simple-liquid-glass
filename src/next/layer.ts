import { fillTexture, writeRectangle } from './glHelpers';
import { buildProgram, type Program } from './glProgram';
import type { MaterialSpec } from './materials';
import {
  MAX_SHAPES,
  SHAPE_ATTRIBUTES,
  SHAPE_BOX,
  SHAPE_STRIDE,
  SPRING_STRIDE,
  type BackdropFrame,
  type GlassCanvas,
  type Rect,
  type ShapeBatch,
} from './scene';
import { CAPACITIES, CONTEXT_OPTIONS, type ContextSource, type LayerEvents } from './layerParts';
import { SpringBank, keepInside } from './springs';
import * as stacks from './stacked';
import { STACKING } from './stacking';

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
  texture: WebGLTexture | null = null;
  /** Kept after upload so the texture can be rebuilt when a lost context comes back. */
  frame: BackdropFrame | null = null;
  backdropRect: Rect = { left: 0, top: 0, width: 1, height: 1 };
  backdropFixed = true;
  private readonly ids = new Uint32Array(MAX_SHAPES);
  private count = 0;
  readonly boxes = new Float32Array(MAX_SHAPES * 4);
  readonly radii = new Float32Array(MAX_SHAPES);
  /** Each shape's attributes, in the groups of four (`vec4`s) a material reads. */
  readonly attributes = Array.from({ length: SHAPE_ATTRIBUTES / 4 }, () => new Float32Array(MAX_SHAPES * 4));
  /** Draws every frame, for a material that reads `slg_time`. */
  running = false;
  /** The material's own textures by name. Each picture is kept so its texture can be rebuilt after a lost context. */
  readonly pictures = new Map<string, { frame: BackdropFrame; texture: WebGLTexture | null }>();
  /** When the layer was made, ms on the caller's clock: `slg_time` counts from here. */
  private born: number | null = null;
  private usable = false;

  constructor(
    readonly canvas: GlassCanvas,
    private view: Rect,
    private fixed: boolean,
    private scale: number,
    private material: MaterialSpec,
    private params: Float32Array,
    private lean: boolean,
    private readonly events: LayerEvents,
    /** Stacking: the layer whose canvas (`canvas`) and context this one draws into, after it. */
    base?: GlassLayer,
  ) {
    this.cutParams();
    if (STACKING && base) {
      stacks.stackOf<GlassLayer>(this).base = base;
      stacks.stackOf(base).members.push(this);
      this.gl = base.gl;
      this.usable = true;
      events.status('drawing', '');
      return;
    }
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

  /** Gives one of the material's own textures its picture. Takes ownership of `frame`. */
  setTexture(name: string, frame: BackdropFrame): void {
    const picture = STACKING ? stacks.ownPicture(this, name) : this.pictures.get(name);
    picture?.frame.close();
    const next = { frame, texture: picture?.texture ?? null };
    this.pictures.set(name, next);
    if (this.gl && this.usable) next.texture = fillTexture(this.gl, next.texture, frame);
    this.dirty = true;
  }

  /** A new picture and where it is; or, with no picture, a new place for the one already here. */
  setBackdrop(frame: BackdropFrame | null, rect: Rect, fixed: boolean): void {
    this.backdropRect = rect;
    this.backdropFixed = fixed;
    this.dirty = true;
    if (!frame) return;
    if (STACKING && !this.frame) this.texture = null; // (a stacked layer's may be its base's)
    this.frame?.close();
    this.frame = frame;
    if (this.gl && this.usable) this.texture = fillTexture(this.gl, this.texture, frame);
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
      // The box's stiffness, the damping, the attributes' stiffness: either can be 0, to go there at once.
      const [box = 0, damping = 0, rest = 0] =
        isNew || reducedMotion ? [] : batch.springs.subarray(i * SPRING_STRIDE);
      for (let k = 0; k < SHAPE_STRIDE; k++) {
        const to = batch.values[i * SHAPE_STRIDE + k] ?? 0;
        this.springs.aim(slot * SHAPE_STRIDE + k, to, k < SHAPE_BOX ? box : rest, damping);
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

  /** Draws the layer with the page scrolled to (`scrollX`, `scrollY`), at `time` (ms on the caller's clock). */
  draw(scrollX: number, scrollY: number, time: number): void {
    this.dirty = false;
    this.born ??= time;
    const gl = this.gl;
    if (!gl || !this.usable) return;
    // Stacking: a layer drawn into another's canvas leaves what is there.
    const over = STACKING && stacks.stackOf<GlassLayer>(this).base;
    if (!over) {
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      // Everything outside the shapes' rectangles is empty: cleared here, never shaded.
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    const program = this.count > 0 ? this.program(gl) : null;
    if (!program) return;

    const { view, material, backdropRect, boxes, radii, attributes, corners } = this;
    const values = this.springs.value;
    // A rectangle reaches as far past its shape as the material can paint, plus the outline's antialiasing.
    const reach = (STACKING ? stacks.reachOf(this, material) : material.bleed) + Math.max(1, 1 / this.scale);
    for (let slot = 0; slot < this.count; slot++) {
      const from = slot * SHAPE_STRIDE;
      const x = STACKING ? (values[from] ?? 0) + stacks.originOf(this)[0] : (values[from] ?? 0);
      const y = STACKING ? (values[from + 1] ?? 0) + stacks.originOf(this)[1] : (values[from + 1] ?? 0);
      const halfWidth = Math.max(values[from + 2] ?? 0, 0);
      const halfHeight = Math.max(values[from + 3] ?? 0, 0);
      const to = slot * 4;
      boxes[to] = x;
      boxes[to + 1] = y;
      boxes[to + 2] = halfWidth;
      boxes[to + 3] = halfHeight;
      radii[slot] = Math.min(Math.max(values[from + 4] ?? 0, 0), halfWidth, halfHeight);
      for (let group = 0; group < attributes.length; group++) {
        const into = attributes[group];
        if (!into) continue;
        for (let k = 0; k < 4; k++) into[to + k] = values[from + SHAPE_BOX + group * 4 + k] ?? 0;
      }

      writeRectangle(corners, slot, x, y, halfWidth + reach, halfHeight + reach, view);
    }
    const { uniforms } = program;
    const once = STACKING && stacks.writeAround(corners, boxes, this.count, reach, view, !!over);
    if (STACKING && over) {
      stacks.beginOver(
        gl,
        stacks.stackOf(over),
        stacks.stackOf<GlassLayer>(this).clip,
        this.scale,
        program.below ?? null,
        material.textures.length + 1,
      );
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, corners);

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
    // Only the attribute groups the material names are uniforms of its program.
    for (const group of program.attributes) gl.uniform4fv(group.location, group.values);
    gl.uniform1f(uniforms.uTime, (time - this.born) / 1000);
    // The backdrop is texture 0; the material's own follow, in the order its spec lists them.
    material.textures.forEach((name, index) => {
      gl.activeTexture(gl.TEXTURE1 + index);
      gl.bindTexture(gl.TEXTURE_2D, this.pictures.get(name)?.texture ?? null);
      gl.uniform1i(program.textures[index] ?? null, index + 1);
    });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
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
    gl.drawArrays(gl.TRIANGLES, 0, once ? 6 : this.count * 6);
    if (STACKING && over) stacks.endOver(gl);
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
    const base = STACKING && stacks.stackOf<GlassLayer>(this).base;
    if (base) stacks.unlend(this);
    else {
      this.canvas.removeEventListener('webglcontextlost', this.onLost);
      this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    }
    this.usable = false;
    this.frame?.close();
    this.frame = null;
    for (const { frame } of this.pictures.values()) frame.close();
    this.pictures.clear();
    // Stacking: the canvas and its context are the base's.
    if (base) stacks.leave(stacks.stackOf(base), this);
    // Frees the GPU memory now instead of when the canvas is collected.
    else this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
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
    if (this.frame) this.texture = fillTexture(this.gl, null, this.frame);
    for (const picture of this.pictures.values()) picture.texture = fillTexture(this.gl, null, picture.frame);
    this.usable = true;
    this.dirty = true;
    this.events.status('drawing', '');
    this.events.wake();
    if (STACKING && !stacks.stackOf<GlassLayer>(this).base)
      stacks.restore(this, (member) => member.onRestored);
  };

  private sizeCanvas(): void {
    if (STACKING && stacks.stackOf<GlassLayer>(this).base) return;
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

  private cutParams(): void {
    this.paramViews = this.material.uniforms.map(({ offset, size }) =>
      this.params.subarray(offset, offset + size),
    );
  }

  /** The program for the layer's material and shape count, in use. Null (and the layer unsupported) if it fails to build. */
  private program(gl: WebGLRenderingContext): Program | null {
    const capacity = CAPACITIES.find((size) => size >= this.count) ?? MAX_SHAPES;
    const { material, lean, current } = this;
    if (current?.material === material && current.capacity === capacity && current.lean === lean) {
      if (STACKING) gl.useProgram(current.handle); // another layer of the canvas may have left its own in use
      return current;
    }

    const key = `${material.id}/${capacity}/${lean ? 'lean' : 'full'}`;
    let program = this.programs.get(key);
    if (!program) {
      try {
        program = STACKING
          ? stacks.sharedProgram(
              gl,
              stacks.stackOf(stacks.stackOf<GlassLayer>(this).base ?? this).compiled,
              key,
              material,
              capacity,
              lean,
              this,
            )
          : buildProgram(gl, material, capacity, lean, this);
      } catch (error) {
        // A context lost mid-build fails the same way; that is reported, and recovered from, by its own event.
        if (gl.isContextLost()) return null;
        this.usable = false;
        this.events.status('unsupported', error instanceof Error ? error.message : String(error));
        return null;
      }
      this.programs.set(key, program);
      if (STACKING) this.events.status('drawing', key); // (its glass shows from this frame: a material takes a while to compile)
    }
    gl.useProgram(program.handle);
    gl.uniform1i(program.uniforms.uBackdrop, 0);
    this.current = program;
    return program;
  }
}
