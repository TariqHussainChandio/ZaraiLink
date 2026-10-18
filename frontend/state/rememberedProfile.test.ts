import AsyncStorage from '@react-native-async-storage/async-storage';
import { forgetRememberedProfile, recallProfile, rememberProfile } from './rememberedProfile';

const dealer = (id: string) =>
  ({ id, role: 'dealer', account_status: 'approved', is_suspended: false, full_name: 'Dealer', phone: '+923001234567' }) as never;

beforeEach(() => AsyncStorage.clear());

describe('the remembered profile', () => {
  it('keeps only the facts that pick the shell, never a name or a phone number', async () => {
    await rememberProfile(dealer('user-a'));
    const raw = await AsyncStorage.getItem('zl-remembered-profile');
    expect(JSON.parse(raw ?? '{}')).toEqual({ id: 'user-a', role: 'dealer', account_status: 'approved', is_suspended: false });
  });

  it('is read back for the same user only', async () => {
    await rememberProfile(dealer('user-a'));
    expect(await recallProfile('user-a')).not.toBeNull();
    expect(await recallProfile('user-b')).toBeNull();
  });

  it('ignores a record that is not one', async () => {
    await AsyncStorage.setItem('zl-remembered-profile', '{"id":"user-a","role":"dealer"}');
    expect(await recallProfile('user-a')).toBeNull();
    await AsyncStorage.setItem('zl-remembered-profile', 'not json');
    expect(await recallProfile('user-a')).toBeNull();
  });

  it('spares the account that is starting now, and forgets anyone else', async () => {
    await rememberProfile(dealer('user-b'));
    await forgetRememberedProfile('user-b');
    expect(await recallProfile('user-b')).not.toBeNull();

    await forgetRememberedProfile('user-c');
    expect(await AsyncStorage.getItem('zl-remembered-profile')).toBeNull();
  });
});
