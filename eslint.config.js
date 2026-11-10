// Lint covers the 6.0 code only (src/next and its demo). The 5.x sources predate this config and are
// left as they are until they are replaced.
import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // The built entry, copied in to serve the demo from a static server (not committed).
  { ignores: ['experiments/next-core/lib/**'] },
  {
    files: ['src/next/**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      prettier,
    ],
    languageOptions: {
      parserOptions: { project: './tsconfig.next.json', tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'max-lines': ['error', { max: 400 }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['experiments/next-core/**/*.{js,mjs}'],
    extends: [js.configs.recommended, prettier],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'max-lines': ['error', { max: 400 }] },
  },
);
