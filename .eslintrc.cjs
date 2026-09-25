module.exports = {
  root: true,
  env: { node: true, es2021: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist/', 'out/', 'node_modules/'],
  rules: {
    // TypeScript checks name resolution; unused declarations remain permitted
    // to match the compiler settings in tsconfig.json.
    'no-undef': 'off',
    'no-unused-vars': 'off',
  },
};
