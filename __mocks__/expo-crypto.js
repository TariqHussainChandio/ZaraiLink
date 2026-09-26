// expo-crypto resolves its native module at import time, which does not exist under Jest.
// Node's own crypto module is a fine stand-in for tests — real randomness, just not the
// hardware-backed CSPRNG the native module uses on-device.
const nodeCrypto = require('crypto');

module.exports = {
  randomUUID: jest.fn(() => nodeCrypto.randomUUID()),
  getRandomBytesAsync: jest.fn(byteCount => Promise.resolve(new Uint8Array(nodeCrypto.randomBytes(byteCount)))),
};
