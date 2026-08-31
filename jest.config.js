module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['react-native-gesture-handler/jestSetup'],
  // GitHub Actions' runners are markedly slower than local dev machines (the full suite takes
  // ~85s there vs ~20s locally) — the 5s Jest default occasionally times out a heavy screen
  // test's cold start there even though it's not actually hung. 15s gives real headroom without
  // masking a genuine infinite-await bug (which would still hang well past that).
  testTimeout: 15000,
  // lucide-react-native ships .mjs; the RN preset's transform only matches js/ts/tsx, so it's
  // added here (the asset transformer entry is copied over since this replaces, not merges,
  // the preset's transform map).
  transform: {
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$':
      '<rootDir>/node_modules/@react-native/jest-preset/jest/assetFileTransformer.js',
    '^.+\\.(js|jsx|mjs|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-.*|@supabase/.*|isows|lucide-react-native)/)',
  ],
};
