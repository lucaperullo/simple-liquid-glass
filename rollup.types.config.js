import { dts } from 'rollup-plugin-dts';

export default ['index', 'interactive', 'mirror', 'web-component', 'webgl', 'backdrop'].map(name => ({
  input: name === 'index' ? '.types/index.d.ts' : `.types/${name}/index.d.ts`,
  output: { file: `dist/${name}.d.ts`, format: 'es' },
  plugins: [dts()],
  external: ['react', 'react-dom']
}));
