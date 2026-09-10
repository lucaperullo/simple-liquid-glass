import babel from '@rollup/plugin-babel';
import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.tsx',
  external: ['react', 'simple-liquid-glass/webgl', 'simple-liquid-glass/backdrop'],
  output: [
    { file: 'dist/index.js', format: 'esm', banner: '"use client";' },
    { file: 'dist/index.cjs', format: 'cjs', banner: '"use client";' }
  ],
  plugins: [resolve({ extensions: ['.js', '.ts', '.tsx'] }), babel({
    babelHelpers: 'bundled',
    extensions: ['.ts', '.tsx'],
    presets: ['@babel/preset-react', '@babel/preset-typescript']
  })]
};
