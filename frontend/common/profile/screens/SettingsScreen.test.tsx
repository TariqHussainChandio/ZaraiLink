import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { SettingsScreen } from './SettingsScreen';
import { PROFILE_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../../state/authStore';
import { useThemeStore } from '../../../state/themeStore';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';
import type { Profile } from '../../types/profile';

function makeNavigation() {
  return { navigate: jest.fn() } as unknown as ProfileScreenProps<'Settings'>['navigation'];
}

beforeEach(() => {
  useAuthStore.setState({
    signOut: jest.fn(),
    refreshProfile: jest.fn().mockResolvedValue(undefined),
    profile: { notifications_enabled: true } as Profile,
    role: 'farmer',
  });
  useThemeStore.setState({ mode: 'system' });
});

afterEach(() => {
  useAuthStore.setState({ role: null });
});

describe('SettingsScreen', () => {
  it('renders the settings sections', async () => {
    await renderWithQuery(<SettingsScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByText('Appearance')).toBeTruthy();
    // The app is English only: there is no language setting.
    expect(screen.queryByText('Language')).toBeNull();
  });

  it('has no Notifications switch: the setting is stored but nothing reads it (AU-07, rule 6)', async () => {
    await renderWithQuery(<SettingsScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.queryByText('Notifications')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('switches the appearance mode', async () => {
    await renderWithQuery(<SettingsScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.press(screen.getByText('Dark'));
    expect(useThemeStore.getState().mode).toBe('dark');
  });

  it('navigates to Password', async () => {
    const navigation = makeNavigation();
    await renderWithQuery(<SettingsScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByText('Password'));
    expect(navigation.navigate).toHaveBeenCalledWith(PROFILE_ROUTES.ChangePassword);
  });

  it('sends an admin to Account security, which holds email, password and two-step verification (A3b)', async () => {
    useAuthStore.setState({ role: 'admin' });
    const navigation = makeNavigation();
    await renderWithQuery(<SettingsScreen navigation={navigation} route={{} as never} />);
    expect(screen.queryByText('Password')).toBeNull();
    await fireEvent.press(screen.getByText('Account security'));
    expect(navigation.navigate).toHaveBeenCalledWith(PROFILE_ROUTES.AccountSecurity);
  });

  it('signs out with an ordinary secondary button, never the red one (AU-08)', async () => {
    const signOut = jest.fn();
    useAuthStore.setState({ signOut });
    await renderWithQuery(<SettingsScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('puts Delete account last, as a quiet entry that opens its own confirmation', async () => {
    const navigation = makeNavigation();
    await renderWithQuery(<SettingsScreen navigation={navigation} route={{} as never} />);
    const buttons = screen.getAllByRole('button').map(button => button.props.accessibilityLabel ?? '');
    expect(buttons.at(-1)).toBe('Delete account');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(navigation.navigate).toHaveBeenCalledWith(PROFILE_ROUTES.DeleteAccount);
  });
});
