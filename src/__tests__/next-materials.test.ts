import { packParams, specOf } from '../next/materials';
import { GLASS_LIGHT, GLASS_MATERIAL, fragmentSource } from '../next/shader';

const spec = specOf({
  id: 'demo',
  shade: 'vec4 slg_shade(vec2 p, vec3 field) { return vec4(colour, strength); }',
  uniforms: { strength: 0.5, colour: [1, 0, 0], corner: [1, 2, 3, 4] },
  bleed: 6,
});

describe('next: materials', () => {
  it("lays a material's uniforms out in one array", () => {
    expect(spec.uniforms).toEqual([
      { name: 'strength', size: 1, offset: 0 },
      { name: 'colour', size: 3, offset: 1 },
      { name: 'corner', size: 4, offset: 4 },
    ]);
    expect(spec.length).toBe(8);
    expect(spec.bleed).toBe(6);
    expect(spec.combine).toBeNull();
  });

  it('packs values over a base, leaving the rest alone', () => {
    const defaults = packParams(spec, { strength: 0.5, colour: [1, 0, 0], corner: [1, 2, 3, 4] });
    expect(Array.from(defaults)).toEqual([0.5, 1, 0, 0, 1, 2, 3, 4]);
    const changed = packParams(spec, { colour: [0, 0, 1] }, defaults);
    expect(Array.from(changed)).toEqual([0.5, 0, 0, 1, 1, 2, 3, 4]);
    expect(Array.from(defaults)).toEqual([0.5, 1, 0, 0, 1, 2, 3, 4]);
  });

  it('refuses names and sizes the material does not declare', () => {
    expect(() => packParams(spec, { color: [0, 0, 1] })).toThrow(/no parameter "color"/);
    expect(() => packParams(spec, { colour: [0, 1] })).toThrow(/takes 3/);
    expect(() => specOf({ id: 'x', shade: '', uniforms: { 'not valid': 1 } })).toThrow(TypeError);
    expect(() => specOf({ id: 'x', shade: '', uniforms: { slg_view: 1 } })).toThrow(TypeError);
    expect(() => specOf({ id: 'x', shade: '', uniforms: { wide: [1, 2, 3, 4, 5] } })).toThrow(TypeError);
  });

  it('builds a shader around the material, with its uniforms declared and the loop bound it was asked for', () => {
    const source = fragmentSource(spec, 8, false);
    expect(source).toContain('uniform float strength;');
    expect(source).toContain('uniform vec3 colour;');
    expect(source).toContain('uniform vec4 corner;');
    expect(source).toContain('uniform vec4 uBox[8];');
    expect(source).toContain('return a.z < b.z ? a : b;');
    expect(source).not.toContain('#define SLG_LEAN');
    expect(fragmentSource(spec, 4, true)).toContain('#define SLG_LEAN 1');
  });

  it("uses the material's own combine in place of the plain union", () => {
    const custom = specOf({ id: 'c', shade: '', combine: 'vec3 slg_combine(vec3 a, vec3 b) { return b; }' });
    const source = fragmentSource(custom, 4, false);
    expect(source).toContain('{ return b; }');
    expect(source).not.toContain('a.z < b.z');
  });

  it('ships a glass whose light tuning only names uniforms the glass has', () => {
    const glass = specOf(GLASS_MATERIAL);
    expect(() => packParams(glass, GLASS_LIGHT)).not.toThrow();
    expect(glass.combine).toBeNull();
    expect(glass.bleed).toBe(0);
  });
});
