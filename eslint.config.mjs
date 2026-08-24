import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const configuredNextVitals = nextVitals.map((config) =>
    config.name === 'next'
        ? {
              ...config,
              rules: {
                  ...config.rules,
                  'react/no-unescaped-entities': 'off',
                  'react/jsx-max-props-per-line': ['error', { maximum: 1, when: 'multiline' }],
                  // Эти правила появились в Next 16 и требуют отдельного
                  // рефакторинга существующих компонентов. Не смешиваем его
                  // с восстановлением прежней проверки CI.
                  'react-hooks/immutability': 'off',
                  'react-hooks/preserve-manual-memoization': 'off',
                  'react-hooks/refs': 'off',
                  'react-hooks/set-state-in-effect': 'off',
              },
          }
        : config,
);

const configuredNextTypescript = nextTypescript.map((config, index) =>
    index === 3
        ? {
              ...config,
              rules: {
                  ...config.rules,
                  '@typescript-eslint/no-unused-vars': 'warn',
                  '@typescript-eslint/no-empty-object-type': 'warn',
                  '@typescript-eslint/no-explicit-any': 'warn',
                  '@typescript-eslint/no-require-imports': 'off',
              },
          }
        : config,
);

const eslintConfig = [
    ...configuredNextVitals,
    ...configuredNextTypescript,
    prettier,
];

export default eslintConfig;
