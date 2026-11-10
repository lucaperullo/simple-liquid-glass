import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import { rollup } from 'rollup';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const packageJson = require('./package.json');

const jsPlugins = () => [
  peerDepsExternal(),
  resolve({
    extensions: ['.js', '.jsx', '.ts', '.tsx']
  }),
  commonjs(),
  babel({
    babelHelpers: 'bundled',
    presets: [['@babel/preset-env', { targets: { chrome: '64', firefox: '69', safari: '12' }, modules: false }], '@babel/preset-react', '@babel/preset-typescript'],
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    exclude: 'node_modules/**'
  }),
  terser({compress:{passes:2}})
];

// The 6.0 worker (./next). src/next/workerSource.ts is replaced by the bundled worker as text, so the
// entry can start it from a Blob URL with nothing for the consumer's bundler or server to find. The same
// text is also written to dist/next-worker.js for sites whose Content-Security-Policy forbids blob:
// workers and host the file themselves.
// `simple-liquid-glass/next/stack` is the same engine with src/next/stacking.ts saying `true`: layers stacked in
// one canvas. The core (./next) is built with it `false`, and carries none of that code.
const stackingOn = () => ({
  name: 'next-stacking-on',
  load(id) {
    return id.replace(/\\/g, '/').endsWith('/src/next/stacking.ts') ? 'export const STACKING = true;' : null;
  }
});
const nextWorkerSource = (stacking = false) => ({
  name: 'next-worker-source',
  async load(id) {
    if (!id.replace(/\\/g, '/').endsWith('/src/next/workerSource.ts')) return null;
    const bundle = await rollup({ input: 'src/next/worker.ts', plugins: [...(stacking ? [stackingOn()] : []), ...jsPlugins()] });
    const { output } = await bundle.generate({ format: 'iife' });
    await bundle.close();
    const code = output[0].code;
    this.emitFile({ type: 'asset', fileName: stacking ? 'next-stack-worker.js' : 'next-worker.js', source: code });
    return `export const WORKER_SOURCE = ${JSON.stringify(code)};`;
  }
});

export default [
  {
    input: 'src/backdrop/index.tsx',
    output: [
      {file:'dist/backdrop.esm.js',format:'esm',sourcemap:true,exports:'named',banner:'"use client";'},
      {file:'dist/backdrop.cjs',format:'cjs',sourcemap:true,exports:'named',banner:'"use client";'}
    ],
    plugins:jsPlugins(),external:['react','react-dom']
  },
  {
    input: 'src/experimental/index.ts',
    output: [
      { file: 'dist/experimental.esm.js', format: 'esm', sourcemap: true, exports: 'named' },
      { file: 'dist/experimental.cjs', format: 'cjs', sourcemap: true, exports: 'named' }
    ],
    plugins: jsPlugins()
  },
  {
    input: 'src/webgl/index.ts',
    output: [
      { file: 'dist/webgl.esm.js', format: 'esm', sourcemap: true, exports: 'named' },
      { file: 'dist/webgl.cjs', format: 'cjs', sourcemap: true, exports: 'named' }
    ],
    plugins: jsPlugins()
  },
  // Core entry (.)
  {
    input: 'src/index.tsx',
    output: [
      { file: packageJson.main, format: 'cjs', sourcemap: true, exports: 'named', banner: '"use client";' },
      { file: packageJson.module, format: 'esm', sourcemap: true, exports: 'named', banner: '"use client";' }
    ],
    plugins: jsPlugins(),
    external: ['react', 'react-dom']
  },
  // Opt-in interactive entry (./interactive) — self-contained (bundles the core) so it works
  // standalone; consumers use either the core OR this, not both.
  {
    input: 'src/interactive/index.tsx',
    output: [
      { file: 'dist/interactive.cjs', format: 'cjs', sourcemap: true, exports: 'named', banner: '"use client";' },
      { file: 'dist/interactive.esm.js', format: 'esm', sourcemap: true, exports: 'named', banner: '"use client";' }
    ],
    plugins: jsPlugins(),
    external: ['react', 'react-dom']
  },
  // Opt-in mirror entry (./mirror) — real refraction on Safari/iOS/Firefox via a displaced
  // live DOM clone. Self-contained (bundles core); consumers use either the core OR this.
  {
    input: 'src/mirror/index.tsx',
    output: [
      { file: 'dist/mirror.cjs', format: 'cjs', sourcemap: true, exports: 'named', banner: '"use client";' },
      { file: 'dist/mirror.esm.js', format: 'esm', sourcemap: true, exports: 'named', banner: '"use client";' }
    ],
    plugins: jsPlugins(),
    external: ['react', 'react-dom']
  },
  // Framework-agnostic <liquid-glass> web component (./web-component) — vanilla, no React.
  {
    input: 'src/web-component/index.ts',
    output: [
      { file: 'dist/web-component.esm.js', format: 'esm', sourcemap: true, exports: 'named' },
      { file: 'dist/web-component.cjs', format: 'cjs', sourcemap: true, exports: 'named' }
    ],
    plugins: jsPlugins()
  },
  // @experimental engine extension API (./engine) — framework-agnostic, no React import.
  // `backdrop.ts` loads the html-to-image HTML-capture pipeline (../webgl/source) through a
  // dynamic import, only for a surface that actually uses an HTML backdrop, so it must build as
  // real separate chunks (output.dir), not a single file — inlining would keep the bytes in the
  // entry file and defeat the point. The exports map still points at dist/engine.esm.js / .cjs.
  {
    input: 'src/engine/index.ts',
    output: [
      { dir: 'dist', entryFileNames: 'engine.esm.js', chunkFileNames: 'engine-[name].esm.js', format: 'esm', sourcemap: true, exports: 'named' },
      { dir: 'dist', entryFileNames: 'engine.cjs', chunkFileNames: 'engine-[name].cjs', format: 'cjs', sourcemap: true, exports: 'named' }
    ],
    plugins: jsPlugins()
  },
  // @experimental 6.0 renderer core (./next) — scene as data, drawn from a worker. No React import.
  {
    input: 'src/next/index.ts',
    output: [
      { file: 'dist/next.esm.js', format: 'esm', sourcemap: true, exports: 'named' },
      { file: 'dist/next.cjs', format: 'cjs', sourcemap: true, exports: 'named' }
    ],
    plugins: [nextWorkerSource(), ...jsPlugins()]
  },
  // The same, with layers stacked in one canvas (./next/stack).
  {
    input: 'src/next/index.ts',
    output: [
      { file: 'dist/next-stack.esm.js', format: 'esm', sourcemap: true, exports: 'named' },
      { file: 'dist/next-stack.cjs', format: 'cjs', sourcemap: true, exports: 'named' }
    ],
    plugins: [stackingOn(), nextWorkerSource(true), ...jsPlugins()]
  }
  // Public types are generated from source and bundled by rollup.types.config.js.
];
