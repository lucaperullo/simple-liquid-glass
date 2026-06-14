import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'dist');

await mkdir(outDir, { recursive: true });

// Core types: copy as-is.
const coreSrc = resolve(root, 'src', 'index.d.ts');
const coreDest = resolve(outDir, 'index.d.ts');
await copyFile(coreSrc, coreDest);
console.log(`[copy-types] Copied ${coreSrc} -> ${coreDest}`);

// Interactive subpath types: dist is flat, so rewrite the source's '../index' import
// (relative to src/interactive/) to './index' (relative to dist/).
const interactiveSrc = resolve(root, 'src', 'interactive', 'index.d.ts');
const interactiveDest = resolve(outDir, 'interactive.d.ts');
const interactiveContent = (await readFile(interactiveSrc, 'utf8')).replace(/(['"])\.\.\/index\1/g, "$1./index$1");
await writeFile(interactiveDest, interactiveContent);
console.log(`[copy-types] Copied ${interactiveSrc} -> ${interactiveDest} (rewrote ../index -> ./index)`);

// Mirror subpath types: rewrite '../index' -> './index' for the flat dist layout.
const mirrorSrc = resolve(root, 'src', 'mirror', 'index.d.ts');
const mirrorDest = resolve(outDir, 'mirror.d.ts');
const mirrorContent = (await readFile(mirrorSrc, 'utf8')).replace(/(['"])\.\.\/index\1/g, "$1./index$1");
await writeFile(mirrorDest, mirrorContent);
console.log(`[copy-types] Copied ${mirrorSrc} -> ${mirrorDest} (rewrote ../index -> ./index)`);

// Web component types: self-contained, copy as-is.
const wcSrc = resolve(root, 'src', 'web-component', 'index.d.ts');
const wcDest = resolve(outDir, 'web-component.d.ts');
await copyFile(wcSrc, wcDest);
console.log(`[copy-types] Copied ${wcSrc} -> ${wcDest}`);
