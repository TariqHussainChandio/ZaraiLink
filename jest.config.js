module.exports = {
  // Android is the only platform this app ships, so tests run with Platform.OS === 'android'.
  // jest-expo also mocks Expo's native modules, which do not exist under Jest.
  preset: 'jest-expo/android',
  setupFiles: ['react-native-gesture-handler/jestSetup', '<rootDir>/jest.flashlist.js', '<rootDir>/jest.react-query.js', '<rootDir>/jest.env.js'],
  // GitHub Actions' runners are markedly slower than local dev machines (the full suite takes
  // ~85s there vs ~20s locally) — the 5s Jest default occasionally times out a heavy screen
  // test's cold start there even though it's not actually hung. 15s gives real headroom without
  // masking a genuine infinite-await bug (which would still hang well past that).
  testTimeout: 15000,
  // Coverage is reported over every source file, not only the ones a test happens to import, so an
  // untested screen shows up as 0% instead of being invisible. There is no threshold yet: phase
  // P11 sets them once the tests exercise real behaviour rather than mocks.
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/testUtils/**',
    '!src/**/__mocks__/**',
  ],
  // lucide-react-native ships .mjs; jest-expo's transform only matches js/ts/tsx, so it is added
  // here. Jest merges this with the preset's transform map rather than replacing it.
  transform: {
    '\\.mjs$': 'babel-jest',
  },
  // Packages that ship untranspiled source (Flow, TypeScript, or ES modules) must go through Babel.
  // This is jest-expo's own list plus the libraries this app adds.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|expo-.*|@expo(nent)?/.*|@react-navigation|react-native-.*|@shopify/flash-list|@supabase/.*|isows|lucide-react-native)/)',
  ],
};
