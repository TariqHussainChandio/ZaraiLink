const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');
const jest = require('eslint-plugin-jest');
const reactNative = require('eslint-plugin-react-native');
const reactNativeCore = require('@react-native/eslint-plugin');

// Rules that the previous config (@react-native/eslint-config) enforced and eslint-config-expo does
// not. They are restored so that changing config does not quietly weaken the checks: the findings
// stayed identical, but a rule that is switched off finds nothing. Deprecated Node-only rules from
// that list (no-mixed-requires, no-path-concat, and similar) are left out, and no-new-object is
// replaced by its successor, no-object-constructor.
const carriedOverErrors = ['no-const-assign', 'no-dupe-class-members', 'no-eval', 'no-global-assign', 'no-new-func'];
const carriedOverWarnings = [
  'consistent-this',
  'dot-notation',
  'no-alert',
  'no-array-constructor',
  'no-bitwise',
  'no-caller',
  'no-cond-assign',
  'no-control-regex',
  'no-debugger',
  'no-delete-var',
  'no-div-regex',
  'no-ex-assign',
  'no-extra-boolean-cast',
  'no-fallthrough',
  'no-func-assign',
  'no-implied-eval',
  'no-invalid-regexp',
  'no-iterator',
  'no-label-var',
  'no-labels',
  'no-lone-blocks',
  'no-new',
  'no-new-wrappers',
  'no-object-constructor',
  'no-obj-calls',
  'no-octal',
  'no-octal-escape',
  'no-proto',
  'no-regex-spaces',
  'no-return-assign',
  'no-script-url',
  'no-self-compare',
  'no-sequences',
  'no-shadow-restricted-names',
  'no-sparse-arrays',
  'no-undef-init',
  'no-useless-escape',
  'no-void',
  'radix',
  'yoda',
  'react/no-did-mount-set-state',
  'react/no-did-update-set-state',
  'react/self-closing-comp',
  'react-native/no-inline-styles',
  '@react-native/no-deep-imports',
];
const severity = (names, level) => Object.fromEntries(names.map(name => [name, level]));

module.exports = [
  ...expoConfig,
  {
    // Generated output, dependencies, and the Python backend (its virtualenv ships JavaScript that is
    // not ours) are never linted. Replaces the old .eslintignore, and covers the dot-folders that
    // ESLint 8 skipped on its own and ESLint 9 does not.
    ignores: ['coverage/', 'android/', 'ios/', '.expo/', 'dist/', 'backend/', '**/.venv/', '.claude/', '.idea/'],
  },
  {
    plugins: { 'react-native': reactNative, '@react-native': reactNativeCore },
    linterOptions: {
      // A disable comment that no longer suppresses anything is a rule someone stopped following
      // without cleaning up. Replaces the old eslint-comments/no-unused-disable rule. The other
      // eslint-comments rules are not restored: the reality gate already fails any new
      // eslint-disable comment in production code, which covers a blanket disable there.
      reportUnusedDisableDirectives: 'warn',
    },
    rules: {
      ...severity(carriedOverErrors, 'error'),
      ...severity(carriedOverWarnings, 'warn'),
      // Kept from the previous React Native config: a component defined inside another component
      // remounts on every render and loses its state.
      'react/no-unstable-nested-components': 'warn',
      // i18next documents `i18n.use(...)` on its default export, so this warning is noise.
      'import/no-named-as-default-member': 'off',
      // React Compiler rules from eslint-plugin-react-hooks 7, beyond the two hook rules the
      // app has always enforced. They flag fetching inside useEffect, the pattern 57 screens
      // use and that plan phase P7 replaces with React Query. P7 turns them on.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/incompatible-library': 'off',
    },
  },
  {
    // The TypeScript plugin is only registered for TypeScript files, so its rules are scoped to them.
    files: ['**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-shadow': 'warn' },
  },
  {
    // Tests and manual mocks run under Jest, which provides describe, it, expect, jest, and so on.
    files: ['**/*.test.{ts,tsx,js}', '__mocks__/**/*.js', 'jest.env.js'],
    plugins: { jest },
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    rules: {
      // A committed it.skip or it.only silently shrinks the suite, which is the failure this project
      // exists to prevent.
      'jest/no-disabled-tests': 'warn',
      'jest/no-focused-tests': 'warn',
      'jest/no-identical-title': 'warn',
      'jest/valid-expect': 'warn',
      // jest.mock calls sit above the imports they affect (babel-jest hoists them), and a few
      // tests load real modules with require().
      'import/first': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Tooling configs are CommonJS files that run under Node.
    files: ['*.config.js', '.prettierrc.js'],
    languageOptions: { globals: globals.node },
  },
];
