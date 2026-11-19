import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { ViewProfileScreen } from './ViewProfileScreen';
import { PROFILE_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../../state/authStore';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';
import type { Profile } from '../../types/profile';

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

  it("renders the user's name, role, and contact details, the phone as it is written locally", async () => {
    useAuthStore.setState({ profile: profile(), user: { email: 'ahmed@example.com' } as never });
    await renderWithQuery(<ViewProfileScreen navigation={makeNavigation()} route={{} as never} />);

    expect(screen.getByText('Ahmed Khan')).toBeTruthy();
    expect(screen.getByText('Farmer')).toBeTruthy();
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

  it('shows a prompt for an empty name', async () => {
    useAuthStore.setState({ profile: profile({ full_name: '' }), user: { email: 'ahmed@example.com' } as never });
    await renderWithQuery(<ViewProfileScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByText('Add your name')).toBeTruthy();
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
});
