import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';

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
  terser()
];

export default [
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
  }
  // Public types are generated from source and bundled by rollup.types.config.js.
];
