import { quantizedSize, buildDisplacementSvg, buildDisplacementDataUri, normalizeAngle } from '../core/displacementMap';

describe('quantizedSize', () => {
  it('quantizes to the step and floors at 8', () => {
    expect(quantizedSize(400, 200, 5, 32)).toEqual({ newwidth: 96, newheight: 32 });
    // tiny sizes never go below 8
    expect(quantizedSize(1, 1, 5, 32).newwidth).toBe(8);
  });
});

describe('normalizeAngle', () => {
  it('wraps to [0,360), rounds, and coerces non-finite to 0', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(45)).toBe(45);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(45.00001)).toBe(45);
    expect(normalizeAngle(NaN)).toBe(0);
    expect(normalizeAngle(Infinity)).toBe(0);
    expect(normalizeAngle(undefined)).toBe(0);
  });
});

describe('buildDisplacementSvg', () => {
  // 400x200 @ divisor 5 / step 32 -> 96x32 (a wide 3:1 element)
  const params = { width: 400, height: 200, divisor: 5, quantStep: 32, radius: 50, border: 0.05, lightness: 53, alpha: 0.9, displace: 5 };
  // 320x320 -> 64x64 (square)
  const square = { width: 320, height: 320, divisor: 5, quantStep: 32, radius: 50, border: 0.05, lightness: 53, alpha: 0.9, displace: 5 };
  const countTransforms = (svg: string) => (svg.match(/gradientTransform/g) || []).length;

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

  describe('shape adaptation (default on)', () => {
    it('builds aspect-true gradients in userSpaceOnUse', () => {
      const svg = buildDisplacementSvg(params);
      expect(svg).toContain('gradientUnits="userSpaceOnUse"');
    });

    it('makes refraction isotropic by scaling the short-axis amplitude', () => {
      // 96x32: long axis (width) keeps full amplitude, short axis (height) scaled by 32/96.
      const svg = buildDisplacementSvg(params);
      expect(svg).toContain('rgb(255,0,0)'); // red (horizontal) full
      expect(svg).toContain('rgb(0,0,85)'); // blue (vertical) reduced ~= 255*32/96
    });

    it('leaves both amplitudes full on a square element', () => {
      const svg = buildDisplacementSvg(square);
      expect(svg).toContain('rgb(255,0,0)');
      expect(svg).toContain('rgb(0,0,255)');
    });
  });

  describe('angle (faithful, shape-adapted)', () => {
    it('rotates BOTH gradients about the pixel center', () => {
      const svg = buildDisplacementSvg({ ...params, angle: 45 });
      // center of a 96x32 viewBox
      expect(svg).toContain('gradientTransform="rotate(45 48 16)"');
      expect(countTransforms(svg)).toBe(2);
    });

    it('emits NO gradientTransform at angle 0 or omitted (and at 360)', () => {
      expect(countTransforms(buildDisplacementSvg(params))).toBe(0);
      expect(countTransforms(buildDisplacementSvg({ ...params, angle: 0 }))).toBe(0);
      expect(countTransforms(buildDisplacementSvg({ ...params, angle: 360 }))).toBe(0);
    });
  });

  describe('shapeAdapt:false (legacy escape hatch)', () => {
    it('emits the legacy objectBoundingBox gradients', () => {
      const svg = buildDisplacementSvg({ ...params, shapeAdapt: false });
      expect(svg).toContain('<linearGradient id="red" x1="100%" y1="0%" x2="0%" y2="0%">');
      expect(svg).toContain('stop-color="red"');
      expect(svg).not.toContain('userSpaceOnUse');
    });

    it('is byte-identical at angle 0 to having no angle', () => {
      expect(buildDisplacementSvg({ ...params, shapeAdapt: false })).toBe(
        buildDisplacementSvg({ ...params, shapeAdapt: false, angle: 0 })
      );
    });

    it('rotates in unit space when an angle is given', () => {
      const svg = buildDisplacementSvg({ ...params, shapeAdapt: false, angle: 45 });
      expect(svg).toContain('gradientTransform="rotate(45 0.5 0.5)"');
      expect(countTransforms(svg)).toBe(2);
    });
  });
});

describe('lens modes', () => {
  const base = { width: 320, height: 320, divisor: 5, quantStep: 32, radius: 50, border: 0.05, lightness: 53, alpha: 0.9, displace: 5 };

  it('defaults to classic and renders the fold-free envelope (neutral plate + edge mask)', () => {
    const svg = buildDisplacementSvg(base);
    expect(svg).toContain('linearGradient id="red"');
    expect(svg).toContain('mask id="clsEnv"');
    expect(svg).toContain('fill="rgb(128,128,128)"'); // neutral plate, not black
    expect(svg).not.toContain('fill="black"');         // shapeAdapt:true never uses the black plate
    expect(svg).not.toContain('cvxMask');
    expect(svg).not.toContain('shiftMask');
    expect(svg).not.toContain('rimMask');
  });

  it('widens the classic envelope band as scale rises', () => {
    const inset = (svg: string) => Number(/<rect x="([0-9.]+)"[^>]*fill="white"/.exec(svg)![1]);
    const lo = buildDisplacementSvg({ ...base, scale: 120 });
    const hi = buildDisplacementSvg({ ...base, scale: 600 });
    expect(inset(hi)).toBeGreaterThan(inset(lo));
  });

  it('keeps shapeAdapt:false byte-for-byte legacy (black plate, no envelope mask)', () => {
    const svg = buildDisplacementSvg({ ...base, shapeAdapt: false });
    expect(svg).toContain('fill="black"');
    expect(svg).not.toContain('clsEnv');
    expect(buildDisplacementSvg({ ...base, shapeAdapt: false })).toBe(
      buildDisplacementSvg({ ...base, shapeAdapt: false, scale: 999 })
    );
  });

  describe('convex', () => {
    const p = { ...base, lens: 'convex' as const };
    it('builds a radial dome mask + two channel baselines', () => {
      const svg = buildDisplacementSvg(p);
      expect(svg).toContain('radialGradient id="cvxEnv"');
      expect(svg).toContain('mask id="cvxMask"');
      expect(svg).toContain('fill="rgb(128,0,0)"');
      expect(svg).toContain('fill="rgb(0,0,128)"');
      expect(svg).toContain('mask="url(#cvxMask)"');
    });
    it('collapses to a neutral no-op ramp at strength 0', () => {
      const svg = buildDisplacementSvg({ ...p, lensStrength: 0 });
      expect(svg).toContain('<linearGradient id="cvxRed"><stop offset="0%" stop-color="rgb(128,0,0)"/></linearGradient>');
    });
  });

  describe('shift', () => {
    const p = { ...base, lens: 'shift' as const };
    it('encodes the direction analytically into a uniform fill (no blend mode)', () => {
      const svg = buildDisplacementSvg({ ...p, lensStrength: 1, angle: 0 });
      expect(svg).toContain('mask="url(#shiftMask)"');
      expect(svg).toContain('fill="rgb(191,0,128)"'); // 0.5 + 0.25 on R, neutral B
      expect(svg).not.toContain('mix-blend-mode');
    });
    it('points the offset along the vertical axis at angle 90', () => {
      expect(buildDisplacementSvg({ ...p, lensStrength: 1, angle: 90 })).toContain('fill="rgb(128,0,191)"');
    });
    it('is a uniform neutral field at strength 0', () => {
      const svg = buildDisplacementSvg({ ...p, lensStrength: 0 });
      expect((svg.match(/rgb\(128,0,128\)/g) || []).length).toBe(2);
    });
  });

  describe('rim', () => {
    const p = { ...base, lens: 'rim' as const };
    it('builds a radial confinement mask + screen-separated signed ramps over a neutral plate', () => {
      const svg = buildDisplacementSvg(p);
      expect(svg).toContain('radialGradient id="rimRadial"');
      expect(svg).toContain('mask id="rimMask"');
      expect(svg).toContain('linearGradient id="rimRed"');
      expect(svg).toContain('mix-blend-mode: screen');
      expect(svg).toContain('fill="rgb(128,0,128)"'); // flat neutral center plate
    });
    it('omits the classic blurred border band (rim owns its own edge)', () => {
      // the gray hsl band is present for classic/convex/shift but not rim
      expect(buildDisplacementSvg(p)).not.toContain('hsl(0 0% 53% / 0.9)');
      expect(buildDisplacementSvg({ ...base, lens: 'convex' })).toContain('hsl(0 0% 53% / 0.9)');
    });
  });
});

describe('buildDisplacementDataUri', () => {
  const params = { width: 400, height: 200, divisor: 5, quantStep: 32, radius: 50, border: 0.05, lightness: 53, alpha: 0.9, displace: 5 };

  it('produces an encoded svg data URI', () => {
    const uri = buildDisplacementDataUri(params);
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(uri)).toContain('viewBox="0 0 96 32"');
  });

  it('round-trips the angle transform through encode/decode', () => {
    const uri = buildDisplacementDataUri({ ...params, angle: 90 });
    expect(decodeURIComponent(uri)).toContain('gradientTransform="rotate(90 48 16)"');
  });
});
