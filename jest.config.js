module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['react-native-gesture-handler/jestSetup'],
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
