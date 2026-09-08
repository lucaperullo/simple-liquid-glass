export function isSemiTransparentColor(input: string | undefined | null): boolean {
  if (!input) return false;
  const color = input.trim();
  // rgba(r,g,b,a)
  const rgba = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(\d*\.?\d+)\s*\)$/i.exec(color);
  if (rgba) {
    const a = parseFloat(rgba[1]);
    return a > 0 && a < 1;
  }
  // hsla(h,s,l,a)
  const hsla = /^hsla\(.*?,\s*(\d*\.?\d+)\s*\)$/i.exec(color);
  if (hsla) {
    const a = parseFloat(hsla[1]);
    return a > 0 && a < 1;
  }
  // hsl(h s l / a) or hsl(h,s%,l%,a) with slash
  const hslSlash = /^hsl\(.*?\/\s*(\d*\.?\d+)\s*\)$/i.exec(color);
  if (hslSlash) {
    const a = parseFloat(hslSlash[1]);
    return a > 0 && a < 1;
  }
  // Hex with alpha: #RGBA or #RRGGBBAA
  const hex4 = /^#([0-9a-f]{4})$/i.exec(color);
  if (hex4) {
    const aHex = hex4[1].slice(3, 4);
    const a = parseInt(aHex + aHex, 16) / 255; // expand to 8-bit
    return a > 0 && a < 1;
  }
  const hex8 = /^#([0-9a-f]{8})$/i.exec(color);
  if (hex8) {
    const aHex = hex8[1].slice(6, 8);
    const a = parseInt(aHex, 16) / 255;
    return a > 0 && a < 1;
  }
  // No detectable alpha
  return false;
}

function addTransparencyToColor(color: string, alpha: number = 0.3): string {
  const trimmed = color.trim();

  // Handle hex colors
  const hex3 = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (hex3) {
    const r = parseInt(hex3[1][0] + hex3[1][0], 16);
    const g = parseInt(hex3[1][1] + hex3[1][1], 16);
    const b = parseInt(hex3[1][2] + hex3[1][2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const hex6 = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (hex6) {
    const r = parseInt(hex6[1].slice(0, 2), 16);
    const g = parseInt(hex6[1].slice(2, 4), 16);
    const b = parseInt(hex6[1].slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Handle rgb colors
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(trimmed);
  if (rgb) {
    const r = parseInt(rgb[1], 10);
    const g = parseInt(rgb[2], 10);
    const b = parseInt(rgb[3], 10);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Handle hsl colors
  const hsl = /^hsl\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i.exec(trimmed);
  if (hsl) {
    const h = hsl[1].trim();
    const s = hsl[2].trim();
    const l = hsl[3].trim();
    return `hsla(${h}, ${s}, ${l}, ${alpha})`;
  }

  // If we can't parse it, return as is
  return trimmed;
}

function addTransparencyToGradient(gradient: string, alpha: number = 0.3): string {
  // Handle linear-gradient, radial-gradient, conic-gradient, etc.
  const gradientMatch = /^(linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient|repeating-conic-gradient)\s*\(/i.exec(gradient);
  if (!gradientMatch) return gradient;

  const gradientType = gradientMatch[1];
  const content = gradient.substring(gradientType.length + 1, gradient.length - 1);

  // Split by commas, but be careful with nested parentheses
  const parts: string[] = [];
  let current = '';
  let parenCount = 0;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '(') parenCount++;
    else if (char === ')') parenCount--;
    else if (char === ',' && parenCount === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current.trim());

  // Process each color stop
  const processedParts = parts.map(part => {
    // Check if this part contains a color
    const colorMatch = /(#[0-9a-f]{3,6}|rgb\([^)]+\)|hsl\([^)]+\)|rgba\([^)]+\)|hsla\([^)]+\))/i.exec(part);
    if (colorMatch) {
      const color = colorMatch[1];
      const transparentColor = addTransparencyToColor(color, alpha);
      return part.replace(color, transparentColor);
    }
    return part;
  });

  return `${gradientType}(${processedParts.join(', ')})`;
}

export function processBackground(background: string | undefined, alpha: number = 0.3): string | undefined {
  if (!background) return undefined;

  // Check if it's already semi-transparent
  if (isSemiTransparentColor(background)) return background;

  // Check if it's a gradient
  if (background.includes('gradient')) {
    return addTransparencyToGradient(background, alpha);
  }

  // Check if it's a URL (image)
  if (background.includes('url(')) return background;

  // Treat as solid color
  return addTransparencyToColor(background, alpha);
}
