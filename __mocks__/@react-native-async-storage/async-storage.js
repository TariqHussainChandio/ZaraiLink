// AsyncStorage needs a native module that does not exist under Jest. The package ships an in-memory
// replacement for exactly this; jest-expo does not provide one, so it is wired up here.
module.exports = require('@react-native-async-storage/async-storage/jest/async-storage-mock');
