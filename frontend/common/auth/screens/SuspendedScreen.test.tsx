import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { SuspendedScreen } from './SuspendedScreen';
import { useAuthStore } from '../../../state/authStore';
import type { Profile } from '../../types/profile';

describe('SuspendedScreen', () => {
  it('says the account is suspended with the neutral status badge, not a red alarm', async () => {
    useAuthStore.setState({ signOut: jest.fn() as never, profile: null });
    await renderWithQuery(<SuspendedScreen />);
    expect(screen.getByText('Your account is suspended')).toBeTruthy();
    expect(screen.getByText('Suspended')).toBeTruthy();
  });

  it('shows the administrator reason when there is one', async () => {
    useAuthStore.setState({
      signOut: jest.fn() as never,
      profile: { account_status_reason: 'Listings were reported as fake.' } as Profile,
    });
    await renderWithQuery(<SuspendedScreen />);
    expect(screen.getByText('Reason from the administrator')).toBeTruthy();
    expect(screen.getByText('Listings were reported as fake.')).toBeTruthy();
  });

  it('does not send the person to a support contact the app does not have', async () => {
    useAuthStore.setState({ signOut: jest.fn() as never, profile: null });
    await renderWithQuery(<SuspendedScreen />);
    expect(screen.getByText(/Support contact details are not in the app yet/)).toBeTruthy();
  });

  it('calls signOut when the button is pressed', async () => {
    const signOut = jest.fn();
    useAuthStore.setState({ signOut: signOut as never, profile: null });
    await renderWithQuery(<SuspendedScreen />);
    await fireEvent.press(screen.getByText('Sign out'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
