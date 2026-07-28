import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import sonarjs from 'eslint-plugin-sonarjs';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

export default [
    eslintPluginUnicorn.configs.unopinionated,
    js.configs.recommended,
    eslintConfigPrettier,
    ...tseslint.configs.recommended,
    {
        plugins: { sonarjs },
        rules: {
            'sonarjs/no-duplicate-string': 'off',
            'sonarjs/cognitive-complexity': 'warn',
            'sonarjs/no-small-switch': 'warn',
        },
    },
    {
        ignores: [
            'dist/**',
            'coverage/**',
            'drizzle/**',
            '**/eslint.config.*',
        ],
    },
    {
        rules: {
            'no-var': 'error',
            'prefer-const': 'error',
            'no-debugger': 'error',
            eqeqeq: ['error', 'always'],
            quotes: ['error', 'single', { avoidEscape: true }],
            'no-unused-vars': 'off',
            camelcase: 'error',
            'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
            'require-await': 'error',
            'no-undef': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/prefer-nullish-coalescing': 'error',
            '@typescript-eslint/no-unused-expressions': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': [
                'error',
                { checksVoidReturn: false },
            ],
            '@typescript-eslint/no-unused-vars': 'error',
            '@typescript-eslint/array-type': 'error',
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    },
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                allowDefaultProject: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
];
