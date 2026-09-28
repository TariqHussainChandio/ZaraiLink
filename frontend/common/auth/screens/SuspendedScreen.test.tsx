import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SuspendedScreen } from './SuspendedScreen';
import { useAuthStore } from '../../../state/authStore';

describe('SuspendedScreen', () => {
  it('renders the suspension message', async () => {
    useAuthStore.setState({ signOut: jest.fn() as never });
    await render(<SuspendedScreen />);
    expect(screen.getByText('Account Suspended')).toBeTruthy();
  });

  it('calls signOut when the button is pressed', async () => {
    const signOut = jest.fn();
    useAuthStore.setState({ signOut: signOut as never });
    await render(<SuspendedScreen />);
    await fireEvent.press(screen.getByText('Sign Out'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
