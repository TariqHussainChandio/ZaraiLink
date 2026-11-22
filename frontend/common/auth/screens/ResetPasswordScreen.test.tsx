import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { AuthApiError } from '@supabase/supabase-js';
import { ResetPasswordScreen } from './ResetPasswordScreen';
import { updatePassword } from '../../profile/services/profileService';
import { useAuthStore } from '../../../state/authStore';
import { PASSWORD_HELPER } from '../../validation/password';

jest.mock('../../profile/services/profileService', () => ({
  updatePassword: jest.fn(),
}));

const mockUpdatePassword = updatePassword as jest.Mock;

beforeEach(() => {
  mockUpdatePassword.mockReset();
});

describe('ResetPasswordScreen', () => {
  it('asks for the new password once, with Show and the shared rule as its helper', async () => {
    await renderWithQuery(<ResetPasswordScreen />);
    expect(screen.getByLabelText('New password')).toBeTruthy();
    expect(screen.getByLabelText('Show password')).toBeTruthy();
    expect(screen.getByText(PASSWORD_HELPER)).toBeTruthy();
    expect(screen.getByLabelText('New password').props.autoComplete).toBe('new-password');
  });

  it.each(['abc', 'abcdefgh', '12345678'])('refuses %s: Supabase would (8 characters, letters and numbers)', async password => {
    await renderWithQuery(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('New password'), password);
    await fireEvent.press(screen.getByText('Update password'));

    expect((await screen.findAllByText(PASSWORD_HELPER)).length).toBeGreaterThan(0);
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('calls updatePassword on success', async () => {
    // No navigation on success, unlike ChangePasswordScreen — authStore's own USER_UPDATED
    // handler (see authStore.test.ts) is what flips RootNavigator over to the app shell.
    mockUpdatePassword.mockResolvedValue(undefined);
    await renderWithQuery(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'secret123');
    await fireEvent.press(screen.getByText('Update password'));

    expect(mockUpdatePassword).toHaveBeenCalledWith('secret123');
  });

  it('shows the submit error when updatePassword rejects', async () => {
    mockUpdatePassword.mockRejectedValue(new AuthApiError('same', 422, 'same_password'));
    await renderWithQuery(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'secret123');
    await fireEvent.press(screen.getByText('Update password'));

    expect(await screen.findByText('Choose a password different from your current one.')).toBeTruthy();
  });

  it('has a Cancel that signs out of the recovery session', async () => {
    const signOut = jest.fn();
    useAuthStore.setState({ signOut: signOut as never });
    await renderWithQuery(<ResetPasswordScreen />);
    await fireEvent.press(screen.getByText('Cancel'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
