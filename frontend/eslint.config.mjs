import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // Backend code may only be imported for its types. A value import would
    // pull server code (AWS SDK, bearer-token fetch helpers) into the client
    // bundle; `import type` is erased at compile time and ships nothing.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@backend/*'],
              allowTypeImports: true,
              message:
                'Import backend modules type-only (import type { ... }) — value imports ship server code to the browser.',
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
