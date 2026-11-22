import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { pickFromLibrary } from '../../../utils/photoPicker';
import { updateProfile, uploadAvatar } from '../services/profileService';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { ViewProfileScreen } from './ViewProfileScreen';
import { ProfilePhoto } from '../components/ProfilePhoto';
import { PROFILE_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../../state/authStore';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';
import type { Profile } from '../../types/profile';

// The optional two-step row reads the account's factor from Supabase Auth: faked at the service edge, none enrolled.
jest.mock('../../auth/services/mfaService', () => ({
  getVerifiedTotpFactorId: jest.fn(() => Promise.resolve(null)),
  enrollTotp: jest.fn(),
  verifyTotpEnrollment: jest.fn(),
  unenrollTotp: jest.fn(),
  verifySecondFactor: jest.fn(),
}));

// The gallery and the upload are the outer edge here: the picker is the system's, the upload is Supabase Storage.
jest.mock('../../../utils/photoPicker', () => ({ pickFromLibrary: jest.fn() }));
jest.mock('../services/profileService', () => ({
  ...jest.requireActual('../services/profileService'),
  uploadAvatar: jest.fn(),
  updateProfile: jest.fn(),
}));

const profile = (overrides: Partial<Profile> = {}): Profile =>
  ({
    id: 'user-1',
    role: 'farmer',
    full_name: 'Ahmed Khan',
    phone: '+923001234567',
    avatar_url: null,
    location: 'Multan, Punjab',
    country: 'Pakistan',
    province: 'Punjab',
    city: 'Multan',
    village: null,
    street: null,
    is_suspended: false,
    notifications_enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as Profile;

function makeNavigation() {
  return { navigate: jest.fn() } as unknown as ProfileScreenProps<'ViewProfile'>['navigation'];
}

describe('ViewProfileScreen', () => {
  it('says the profile could not be loaded, and still offers a way to sign out (AU-24)', async () => {
    const refreshProfile = jest.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ profile: null, user: null, refreshProfile });
    await renderWithQuery(<ViewProfileScreen navigation={makeNavigation()} route={{} as never} />);

    expect(screen.getByText("Couldn't load your profile")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refreshProfile).toHaveBeenCalledTimes(1);
  });

  it('renders the contact details, the phone as it is written locally; the name and role are in the app bar (D20)', async () => {
    useAuthStore.setState({ profile: profile(), user: { email: 'ahmed@example.com' } as never });
    await renderWithQuery(<ViewProfileScreen navigation={makeNavigation()} route={{} as never} />);

    expect(screen.queryByText('Ahmed Khan')).toBeNull();
    expect(screen.queryByText('Farmer')).toBeNull();
    expect(screen.getByText('ahmed@example.com')).toBeTruthy();
    expect(screen.getByText('0300 1234567')).toBeTruthy();
    expect(screen.getByText('Multan, Punjab, Pakistan')).toBeTruthy();
  });

  it('shows the structured place from sign-up, the village first, and the address (A3b)', async () => {
    useAuthStore.setState({
      profile: profile({ village: 'Goth Ali', city: 'Hyderabad', province: 'Sindh', street: 'House 4, Main Road' }),
      user: { email: 'ahmed@example.com' } as never,
    });
    await renderWithQuery(<ViewProfileScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByText('Goth Ali, Hyderabad, Sindh, Pakistan')).toBeTruthy();
    expect(screen.getByText('House 4, Main Road')).toBeTruthy();
  });

  it('falls back to the old free-text location when no structured place is set', async () => {
    useAuthStore.setState({
      profile: profile({ country: null, province: null, city: null, location: 'Multan, Punjab' }),
      user: { email: 'ahmed@example.com' } as never,
    });
    await renderWithQuery(<ViewProfileScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByText('Multan, Punjab')).toBeTruthy();
  });

  it("opens a dealer's business details, and offers them to no other role", async () => {
    useAuthStore.setState({ profile: profile({ role: 'dealer' }), user: { email: 'd@example.com' } as never });
    const navigation = makeNavigation();
    await renderWithQuery(<ViewProfileScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByText('Business details'));
    expect(navigation.navigate).toHaveBeenCalledWith(PROFILE_ROUTES.BusinessDetails);
  });

  it.each(['farmer', 'buyer', 'expert', 'admin'] as const)('shows no business details for a %s', async role => {
    useAuthStore.setState({ profile: profile({ role }), user: { email: 'ahmed@example.com' } as never });
    await renderWithQuery(<ViewProfileScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.queryByText('Business details')).toBeNull();
  });

  it('turns missing values into prompts that open the form, not dashes', async () => {
    useAuthStore.setState({
      profile: profile({ phone: null, location: null, country: null, province: null, city: null }),
      user: { email: 'ahmed@example.com' } as never,
    });
    const navigation = makeNavigation();
    await renderWithQuery(<ViewProfileScreen navigation={navigation} route={{} as never} />);
    expect(screen.queryByText('—')).toBeNull();
    expect(screen.getByText('Add phone number')).toBeTruthy();
    expect(screen.getByText('Add your location')).toBeTruthy();
    expect(screen.getByText('Add your address')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add phone number'));
    expect(navigation.navigate).toHaveBeenCalledWith(PROFILE_ROUTES.EditProfile);
  });

  it('is the merged Account tab: edit profile, appearance, password, sign out and delete account in one list (D3)', async () => {
    useAuthStore.setState({ profile: profile(), user: { email: 'ahmed@example.com' } as never, signOut: jest.fn() });
    const navigation = makeNavigation();
    await renderWithQuery(<ViewProfileScreen navigation={navigation} route={{} as never} />);

    await fireEvent.press(screen.getByText('Edit profile'));
    expect(navigation.navigate).toHaveBeenCalledWith(PROFILE_ROUTES.EditProfile);
    expect(screen.getByText('Appearance')).toBeTruthy();
    expect(screen.queryByText('Notifications')).toBeNull();

    await fireEvent.press(screen.getByText('Password'));
    expect(navigation.navigate).toHaveBeenCalledWith(PROFILE_ROUTES.ChangePassword);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(navigation.navigate).toHaveBeenCalledWith(PROFILE_ROUTES.DeleteAccount);
  });

  it('offers everyone but the admin the optional two-step verification', async () => {
    useAuthStore.setState({ profile: profile(), role: 'farmer', user: { email: 'ahmed@example.com' } as never });
    const navigation = makeNavigation();
    await renderWithQuery(<ViewProfileScreen navigation={navigation} route={{} as never} />);
    expect(await screen.findByText('Off (optional)')).toBeTruthy();
    await fireEvent.press(screen.getByText('Two-step verification'));
    expect(navigation.navigate).toHaveBeenCalledWith(PROFILE_ROUTES.MfaEnrollment);
  });

  // D19: the one admin's details are set by the system; only the password changes.
  it("shows the admin who they are, read-only, with the password, appearance and sign out and nothing else", async () => {
    useAuthStore.setState({
      profile: profile({ role: 'admin', full_name: 'Platform Admin', street: 'Somewhere' }),
      role: 'admin',
      user: { email: 'admin@example.com' } as never,
      signOut: jest.fn(),
    });
    const navigation = makeNavigation();
    await renderWithQuery(<ViewProfileScreen navigation={navigation} route={{} as never} />);

    expect(screen.getByText('admin@example.com')).toBeTruthy();
    expect(screen.getByText('Appearance')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    for (const absent of ['Edit profile', 'Phone', 'Place', 'Address', 'Somewhere', 'Two-step verification', 'Delete account', 'Account security']) {
      expect(screen.queryByText(absent)).toBeNull();
    }
    await fireEvent.press(screen.getByText('Password'));
    expect(navigation.navigate).toHaveBeenCalledWith(PROFILE_ROUTES.ChangePassword);
  });

  // D20: everyone changes their own photo from the photo in their Account's app bar, the admin included.
  it.each(['farmer', 'admin'] as const)('lets the %s open their photo and change it with Edit photo, after asking to open the gallery', async role => {
    const refreshProfile = jest.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ profile: profile({ role, avatar_url: 'https://example.test/old.jpg' }), user: { id: 'user-1' } as never, refreshProfile });
    (pickFromLibrary as jest.Mock).mockResolvedValue([{ uri: 'file:///new.jpg', mimeType: 'image/jpeg' }]);
    (uploadAvatar as jest.Mock).mockResolvedValue('https://example.test/new.jpg');
    (updateProfile as jest.Mock).mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find(button => button.text === 'Allow')?.onPress?.();
    });

    await renderWithQuery(<ProfilePhoto compact />);
    await fireEvent.press(screen.getByRole('imagebutton', { name: 'Your profile photo' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit photo' }));

    expect(alert).toHaveBeenCalledWith('Open your gallery?', expect.any(String), expect.any(Array));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ avatar_url: 'https://example.test/new.jpg' }));
    expect(uploadAvatar).toHaveBeenCalledWith('user-1', expect.objectContaining({ uri: 'file:///new.jpg' }));
    expect(refreshProfile).toHaveBeenCalled();
    alert.mockRestore();
  });

  it('opens nothing when the person says Not now to the gallery', async () => {
    useAuthStore.setState({ profile: profile({ avatar_url: null }), user: { id: 'user-1' } as never });
    (pickFromLibrary as jest.Mock).mockReset();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find(button => button.text === 'Not now')?.onPress?.();
    });
    await renderWithQuery(<ProfilePhoto compact />);
    await fireEvent.press(screen.getByRole('imagebutton', { name: 'Add a profile photo' }));
    expect(alert).toHaveBeenCalled();
    expect(pickFromLibrary).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
