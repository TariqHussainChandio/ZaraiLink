module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // zod v4 uses `export * as core from ...`, which Metro's transform needs this plugin for.
  plugins: ['@babel/plugin-transform-export-namespace-from'],
};
