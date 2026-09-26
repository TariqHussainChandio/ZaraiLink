// expo-secure-store resolves its native module (Android Keystore / iOS Keychain) at import time,
// which does not exist under Jest, and jest-expo provides no built-in replacement. This is a
// minimal in-memory stand-in — real enough for encryptedStorage.test.ts to prove a round trip,
// not a security-equivalent implementation.
const store = new Map();

module.exports = {
  getItemAsync: jest.fn(key => Promise.resolve(store.has(key) ? store.get(key) : null)),
  setItemAsync: jest.fn((key, value) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn(key => {
    store.delete(key);
    return Promise.resolve();
  }),
  __reset: () => store.clear(),
};
