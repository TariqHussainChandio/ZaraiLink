import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { SettingsScreen } from './SettingsScreen';
import { updateProfile } from '../services/profileService';
import { PROFILE_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../../state/authStore';
import { useThemeStore } from '../../../state/themeStore';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';
import type { Profile } from '../../types/profile';

jest.mock('../services/profileService', () => ({
  updateProfile: jest.fn(),
}));

const mockUpdateProfile = updateProfile as jest.Mock;

function makeNavigation() {
  return { navigate: jest.fn() } as unknown as ProfileScreenProps<'Settings'>['navigation'];
}

beforeEach(() => {
  mockUpdateProfile.mockReset();
  useAuthStore.setState({
    signOut: jest.fn(),
    refreshProfile: jest.fn().mockResolvedValue(undefined),
    profile: { notifications_enabled: true } as Profile,
  });
  useThemeStore.setState({ mode: 'system' });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SettingsScreen', () => {
  it('renders the settings sections', async () => {
    await renderWithQuery(<SettingsScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('Appearance')).toBeTruthy();
    // The app is English only: there is no language setting.
    expect(screen.queryByText('Language')).toBeNull();
  });

  it('toggles notifications and refreshes the profile', async () => {
    const refreshProfile = jest.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ refreshProfile });
    await renderWithQuery(<SettingsScreen navigation={makeNavigation()} route={{} as never} />);

    const notificationsSwitch = screen.getByRole('switch', { name: 'Notifications' });
    await fireEvent(notificationsSwitch, 'valueChange', false);

    expect(mockUpdateProfile).toHaveBeenCalledWith({ notifications_enabled: false });
    await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
  });

  it('shows an alert when updating the notification setting fails', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('offline'));
    await renderWithQuery(<SettingsScreen navigation={makeNavigation()} route={{} as never} />);

    const notificationsSwitch = screen.getByRole('switch', { name: 'Notifications' });
    await fireEvent(notificationsSwitch, 'valueChange', false);

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Could not update notification setting', 'offline'),
    );
  });

  it('switches the appearance mode', async () => {
    await renderWithQuery(<SettingsScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.press(screen.getByText('Dark'));
    expect(useThemeStore.getState().mode).toBe('dark');
  });

  it('navigates to Change Password', async () => {
    const navigation = makeNavigation();
    await renderWithQuery(<SettingsScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByText('Change Password'));
    expect(navigation.navigate).toHaveBeenCalledWith(PROFILE_ROUTES.ChangePassword);
  });

  it('signs out when Sign Out is pressed', async () => {
    const signOut = jest.fn();
    useAuthStore.setState({ signOut });
    await renderWithQuery(<SettingsScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.press(screen.getByText('Sign Out'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
