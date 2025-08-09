import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'src', 'index.d.ts');
const outDir = resolve(root, 'dist');
const dest = resolve(outDir, 'index.d.ts');

await mkdir(outDir, { recursive: true });
await copyFile(src, dest);
console.log(`[copy-types] Copied ${src} -> ${dest}`);


