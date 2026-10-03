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
  it('renders nothing while the profile has not loaded', async () => {
    useAuthStore.setState({ profile: null, user: null });
    const { toJSON } = await renderWithQuery(
      <ViewProfileScreen navigation={makeNavigation()} route={{} as never} />,
    );
    // The test providers (as in the app) wrap the screen; the screen itself adds nothing inside them.
    expect(toJSON()).toMatchObject({ children: [] });
  });

  it("renders the user's name, role, and contact details", async () => {
    useAuthStore.setState({ profile: profile(), user: { email: 'ahmed@example.com' } as never });
    await renderWithQuery(<ViewProfileScreen navigation={makeNavigation()} route={{} as never} />);

    expect(screen.getByText('Ahmed Khan')).toBeTruthy();
    expect(screen.getByText('Farmer')).toBeTruthy();
    expect(screen.getByText('ahmed@example.com')).toBeTruthy();
    expect(screen.getByText('+923001234567')).toBeTruthy();
    expect(screen.getByText('Multan, Punjab')).toBeTruthy();
  });

  it('shows a placeholder for an empty name', async () => {
    useAuthStore.setState({ profile: profile({ full_name: '' }), user: { email: 'ahmed@example.com' } as never });
    await renderWithQuery(<ViewProfileScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByText('No name yet')).toBeTruthy();
  });

  it('shows placeholders for missing phone and location', async () => {
    useAuthStore.setState({
      profile: profile({ phone: null, location: null }),
      user: { email: 'ahmed@example.com' } as never,
    });
    await renderWithQuery(<ViewProfileScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getAllByText('—').length).toBe(2);
  });

  it('navigates to EditProfile and Settings', async () => {
    useAuthStore.setState({ profile: profile(), user: { email: 'ahmed@example.com' } as never });
    const navigation = makeNavigation();
    await renderWithQuery(<ViewProfileScreen navigation={navigation} route={{} as never} />);

    await fireEvent.press(screen.getByText('Edit Profile'));
    expect(navigation.navigate).toHaveBeenCalledWith(PROFILE_ROUTES.EditProfile);

    await fireEvent.press(screen.getByText('Settings'));
    expect(navigation.navigate).toHaveBeenCalledWith(PROFILE_ROUTES.Settings);
  });
});
