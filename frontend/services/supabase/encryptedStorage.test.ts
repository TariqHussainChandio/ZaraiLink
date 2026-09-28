import AsyncStorage from '@react-native-async-storage/async-storage';
import { EncryptedStorage } from './encryptedStorage';

const secureStoreMock = require('expo-secure-store');

afterEach(async () => {
  await AsyncStorage.clear();
  secureStoreMock.__reset();
  jest.clearAllMocks();
});

describe('EncryptedStorage', () => {
  it('round-trips a value through set then get', async () => {
    const session = JSON.stringify({ access_token: 'abc.def.ghi', refresh_token: 'r-1' });

    await EncryptedStorage.setItem('supabase.auth.token', session);
    const read = await EncryptedStorage.getItem('supabase.auth.token');

    expect(read).toBe(session);
  });

  it('returns null for a key that was never set', async () => {
    const read = await EncryptedStorage.getItem('never-set');
    expect(read).toBeNull();
  });

  it('stores ciphertext in AsyncStorage, not the plaintext value (AT7)', async () => {
    const secret = 'this-must-not-appear-in-plaintext-on-disk';

    await EncryptedStorage.setItem('k', secret);
    const raw = await AsyncStorage.getItem('k');

    expect(raw).not.toBeNull();
    expect(raw).not.toContain(secret);
    // The stored payload is `<hex counter>:<hex ciphertext>` — sanity-check the shape rather than
    // asserting exact bytes, which would make this test brittle against the AES implementation.
    expect(raw).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it('reuses the same encryption key across separate set calls (does not re-key every write)', async () => {
    await EncryptedStorage.setItem('k1', 'value-one');
    await EncryptedStorage.setItem('k2', 'value-two');

    // setItemAsync on the SecureStore key is only called once (key creation) — not once per value
    // stored, which would defeat the point of a single stable key.
    const keyWrites = secureStoreMock.setItemAsync.mock.calls.filter(
      ([key]: [string]) => key === 'zarailink_session_encryption_key',
    );
    expect(keyWrites).toHaveLength(1);

    expect(await EncryptedStorage.getItem('k1')).toBe('value-one');
    expect(await EncryptedStorage.getItem('k2')).toBe('value-two');
  });

  it('removeItem deletes the underlying AsyncStorage entry', async () => {
    await EncryptedStorage.setItem('k', 'v');
    await EncryptedStorage.removeItem('k');

    expect(await EncryptedStorage.getItem('k')).toBeNull();
  });
});
