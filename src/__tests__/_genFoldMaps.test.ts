/**
 * Generator (not a behavioral test): emits verify/fold-maps.json from the REAL displacement-map
 * builder so verify/fold-check.html can rasterize the actual emitted SVGs and measure the fold.
 * Run with: npx jest _genFoldMaps
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { buildDisplacementDataUri } from '../core/displacementMap';

const base = { divisor: 5, quantStep: 32, border: 0.05, lightness: 53, alpha: 0.9, displace: 5, blend: 'difference' as const };
const shapes = [
  { label: 'sq320', width: 320, height: 320, radius: 50 },
  { label: 'wide480', width: 480, height: 160, radius: 40 },
];
const scales = [160, 320, 480];

// Skipped in CI (it writes to the gitignored verify/ scratch dir). Run on demand:
//   GEN_FOLD_MAPS=1 npx jest _genFoldMaps
const run = process.env.GEN_FOLD_MAPS === '1' ? it : it.skip;

describe('generate verify/fold-maps.json', () => {
  run('writes the real emitted maps (new + legacy) for the fold-check page', () => {
    const maps: Array<{ label: string; kind: string; scale: number; w: number; h: number; uri: string }> = [];
    for (const s of shapes) {
      for (const scale of scales) {
        maps.push({
          label: s.label, kind: 'new', scale, w: s.width, h: s.height,
          uri: buildDisplacementDataUri({ ...base, width: s.width, height: s.height, radius: s.radius, shapeAdapt: true, scale }),
        });
        maps.push({
          label: s.label, kind: 'legacy', scale, w: s.width, h: s.height,
          uri: buildDisplacementDataUri({ ...base, width: s.width, height: s.height, radius: s.radius, shapeAdapt: false, scale }),
        });
      }
    }
    const dir = join(__dirname, '..', '..', 'verify');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'fold-maps.json'), JSON.stringify(maps));
    expect(maps.length).toBe(shapes.length * scales.length * 2);
  });
});
