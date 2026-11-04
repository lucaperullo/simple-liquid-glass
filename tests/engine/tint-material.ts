/**
 * An MIT example material for `simple-liquid-glass/engine`: a flat tint, optionally mixed with
 * whatever lies behind the surface (`inputs.backdrop`). Used by the engine's own conformance
 * tests (Jest and `experiments/engine`) and a reasonable starting point for a third-party
 * material — it exercises every piece of the G1/G2/G3/G10 surface: `slg_shade`, `caps`,
 * `ctx.uniform`/`ctx.bind`, `ctx.resource` and `ctx.draw(rects)`.
 */
import type { EngineCapabilities, GlassEngine, Material, MaterialDefinition, Resource } from '../../src/engine';

export interface TintParams {
  /** Premultiplied RGBA, 0..1. */
  color: readonly [number, number, number, number];
  /** 0 = flat colour, 1 = fully mixed with the backdrop (if any). */
  mix: number;
  /** When true, `draw` reports 'pending' once before 'drawn' (exercises the draw-result protocol). */
  settling?: boolean;
  /** When true, `draw` throws (exercises the material-error fallback). */
  explode?: boolean;
}

/** A 2x2 noise texture: a trivial G10 per-context resource, shared by every surface using this
 * material on the same WebGL context. */
export function defineTintMaterial(engine: GlassEngine): { material: Material<TintParams>; noise: Resource<WebGLTexture> } {
  const noise = engine.defineResource<WebGLTexture>({
    id: 'tests/engine/tint-noise@1',
    create(gl) {
      const texture = gl.createTexture();
      if (!texture) throw new Error('tint-material: texture allocation failed');
      const pixels = new Uint8Array([255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 255, 255, 255, 0]);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      return texture;
    },
    dispose(gl, texture) { gl.deleteTexture(texture); },
  });

  const definition: MaterialDefinition<TintParams> = {
    id: 'tests/engine/tint@1',
    fragment: (_caps: EngineCapabilities) => `
      uniform vec4 u_color;
      uniform float u_mix;
      vec4 slg_shade(vec2 p) {
        vec3 base = slg_backdrop(slg_toScreen(p));
        vec3 rgb = mix(u_color.rgb, base, clamp(u_mix, 0.0, 1.0) * slg_hasBackdrop());
        return vec4(rgb * u_color.a, u_color.a);
      }
    `,
    uniforms: ['u_color', 'u_mix'],
    samplers: ['u_noise'],
    inputs: { backdrop: true },
    draw(ctx, params) {
      if (params.explode) throw new Error('tint-material: forced failure');
      ctx.uniform('u_color', ...params.color);
      ctx.uniform('u_mix', params.mix);
      ctx.bind('u_noise', ctx.resource(noise));
      ctx.draw();
      // `settling` is the caller's own state (held in `params`, one copy per surface): the
      // caller flips it off once its own "still loading" condition clears. The material itself
      // stays stateless, as any real material driven by `Surface.update()` should.
      return params.settling ? 'pending' : 'drawn';
    },
  };
  return { material: engine.defineMaterial(definition), noise };
}
