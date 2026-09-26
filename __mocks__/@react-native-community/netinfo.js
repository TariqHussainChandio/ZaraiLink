// NetInfo needs a native module that does not exist under Jest; the package ships a mock for exactly this.
module.exports = require('@react-native-community/netinfo/jest/netinfo-mock.js');
