import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// P4 (4B.1): the Supabase session (access + refresh token) used to sit in plain AsyncStorage —
// readable by anything with filesystem access on a rooted/jailbroken device. `expo-secure-store`
// alone would be the simplest fix, but it's Keystore/Keychain-backed storage meant for small
// values (historically ~2KB on Android) and a session blob can exceed that. This is Supabase's
// own documented pattern for React Native: a small, randomly generated AES key lives in
// SecureStore (always well under its size limit), while the actual session blob — any size — is
// encrypted with that key and stored in AsyncStorage. Reading the AsyncStorage entry directly
// off disk yields ciphertext, not the session (proves AT7).
const KEY_STORAGE_KEY = 'zarailink_session_encryption_key';
const KEY_BYTE_LENGTH = 32; // AES-256

async function getOrCreateEncryptionKey(): Promise<Uint8Array> {
  const existing = await SecureStore.getItemAsync(KEY_STORAGE_KEY);
  if (existing) {
    return aesjs.utils.hex.toBytes(existing);
  }

  const key = await Crypto.getRandomBytesAsync(KEY_BYTE_LENGTH);
  await SecureStore.setItemAsync(KEY_STORAGE_KEY, aesjs.utils.hex.fromBytes(key));
  return key;
}

// AES-CTR needs a counter/IV that is never reused with the same key. A fresh random one is
// generated on every write and stored alongside the ciphertext (it isn't secret, only the key
// is) — read back on decrypt to reconstruct the same keystream.
const COUNTER_BYTE_LENGTH = 16;

export const EncryptedStorage = {
  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;

    const [counterHex, cipherHex] = stored.split(':');
    if (!counterHex || !cipherHex) return null;

    const encryptionKey = await getOrCreateEncryptionKey();
    const counter = new aesjs.Counter(aesjs.utils.hex.toBytes(counterHex));
    const decryptedBytes = new aesjs.ModeOfOperation.ctr(encryptionKey, counter).decrypt(
      aesjs.utils.hex.toBytes(cipherHex),
    );
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  },

  async setItem(key: string, value: string): Promise<void> {
    const encryptionKey = await getOrCreateEncryptionKey();
    const counterBytes = await Crypto.getRandomBytesAsync(COUNTER_BYTE_LENGTH);
    const counter = new aesjs.Counter(counterBytes);
    const encryptedBytes = new aesjs.ModeOfOperation.ctr(encryptionKey, counter).encrypt(
      aesjs.utils.utf8.toBytes(value),
    );
    const payload = `${aesjs.utils.hex.fromBytes(counterBytes)}:${aesjs.utils.hex.fromBytes(encryptedBytes)}`;
    await AsyncStorage.setItem(key, payload);
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};
