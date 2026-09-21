const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// Excludes native build output from Metro's file watcher/resolver. Without Watchman installed,
// Metro falls back to Node's raw fs.watch-based FallbackWatcher, which crashes with an uncaught
// ENOENT if a directory it's watching gets deleted out from under it — exactly what happens to
// android/app/.cxx/**/CMakeTmp/** (CMake's own transient compiler-check scratch dirs, created
// and removed mid-build). These directories are pure native build artifacts Metro never needs
// to bundle JS from, so excluding them avoids the crash and speeds up the initial file crawl too.
const config = {
  resolver: {
    blockList: [/android\/.*\/(build|\.cxx)\/.*/, /android\/(build|\.cxx)\/.*/],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);