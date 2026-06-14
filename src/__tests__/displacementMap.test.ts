import { quantizedSize, buildDisplacementSvg, buildDisplacementDataUri } from '../core/displacementMap';

describe('quantizedSize', () => {
  it('quantizes to the step and floors at 8', () => {
    expect(quantizedSize(400, 200, 5, 32)).toEqual({ newwidth: 96, newheight: 32 });
    // tiny sizes never go below 8
    expect(quantizedSize(1, 1, 5, 32).newwidth).toBe(8);
  });
});

describe('buildDisplacementSvg', () => {
  const params = { width: 400, height: 200, divisor: 5, quantStep: 32, radius: 50, border: 0.05, lightness: 53, alpha: 0.9, displace: 5 };

  it('embeds the quantized viewBox and the shape params', () => {
    const svg = buildDisplacementSvg(params);
    expect(svg).toContain('viewBox="0 0 96 32"');
    expect(svg).toContain('hsl(0 0% 53% / 0.9)');
    expect(svg).toContain('filter:blur(5px)');
    expect(svg).toContain('mix-blend-mode: difference'); // default blend
  });

  it('honors a custom blend mode', () => {
    expect(buildDisplacementSvg({ ...params, blend: 'screen' })).toContain('mix-blend-mode: screen');
  });
});

describe('buildDisplacementDataUri', () => {
  it('produces an encoded svg data URI', () => {
    const uri = buildDisplacementDataUri({ width: 400, height: 200, divisor: 5, quantStep: 32, radius: 50, border: 0.05, lightness: 53, alpha: 0.9, displace: 5 });
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(uri)).toContain('viewBox="0 0 96 32"');
  });
});
