// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // src/generated 是 Prisma 產生的程式碼，不該被 lint 或格式化
    ignores: ['eslint.config.mjs', 'dist/**', 'src/generated/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      // ignoreRestSiblings 是 Ch9 加的，為了 `const { passwordHash, ...safe } = user`
      // 這個「剔除某幾個欄位、其餘照舊」的慣用寫法 —— 沒有它的話 passwordHash
      // 會被判成「宣告了卻沒用到」。
      //
      // 選它而不是「明確列出要回傳的欄位」，理由是往前看一章：Ch11 會給 User
      // 加 role 欄位。明確列的寫法要記得回來補一行，忘了就是「回應少了 role」
      // 而且沒有任何錯誤訊息；解構的寫法則會讓新欄位自動流過去。
      // 代價同 prisma.service.ts 的全域 omit：機密欄位要擋在那一層，不是這裡。
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true },
      ],
    },
  },
);
