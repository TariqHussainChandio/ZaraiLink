const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Excludes native build output from Metro's file watcher and resolver. Without Watchman installed,
// Metro falls back to Node's raw fs.watch watcher, which crashes with an uncaught ENOENT when a
// watched directory disappears mid-build. That is exactly what happens to
// android/app/.cxx/**/CMakeTmp/**, CMake's transient compiler-check directories, which are created
// and removed during a native build. Metro never bundles JavaScript from these folders. Expo's own
// default already skips android/app/build and android/.gradle; this adds the C++ build trees.
// [\\/] matches both path separators, because Metro tests these against native Windows paths.
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  /android[\\/](?:.*[\\/])?(?:build|\.cxx)[\\/].*/,
];

module.exports = config;
