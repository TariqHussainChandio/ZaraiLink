import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AuthApiError } from '@supabase/supabase-js';
import { ResetPasswordScreen } from './ResetPasswordScreen';
import { updatePassword } from '../../services/modules/profile/profileService';

jest.mock('../../services/modules/profile/profileService', () => ({
  updatePassword: jest.fn(),
}));

const mockUpdatePassword = updatePassword as jest.Mock;

beforeEach(() => {
  mockUpdatePassword.mockReset();
});

describe('ResetPasswordScreen', () => {
  it('renders the password fields', async () => {
    await renderWithQuery(<ResetPasswordScreen />);
    expect(screen.getByLabelText('New password')).toBeTruthy();
    expect(screen.getByLabelText('Confirm password')).toBeTruthy();
  });

  it('shows a validation error for a too-short password', async () => {
    await renderWithQuery(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'abc');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'abc');
    await fireEvent.press(screen.getByText('Update password'));

    expect(await screen.findByText('Password must be at least 6 characters')).toBeTruthy();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('shows a validation error when passwords do not match', async () => {
    await renderWithQuery(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'secret123');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'different1');
    await fireEvent.press(screen.getByText('Update password'));

    expect(await screen.findByText("Passwords don't match")).toBeTruthy();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('calls updatePassword on success', async () => {
    // No navigation on success, unlike ChangePasswordScreen — authStore's own USER_UPDATED
    // handler (see authStore.test.ts) is what flips RootNavigator over to the app shell.
    mockUpdatePassword.mockResolvedValue(undefined);
    await renderWithQuery(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'secret123');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'secret123');
    await fireEvent.press(screen.getByText('Update password'));

    expect(mockUpdatePassword).toHaveBeenCalledWith('secret123');
  });

  it('shows the submit error when updatePassword rejects', async () => {
    mockUpdatePassword.mockRejectedValue(new AuthApiError('same', 422, 'same_password'));
    await renderWithQuery(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'secret123');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'secret123');
    await fireEvent.press(screen.getByText('Update password'));

    expect(await screen.findByText('Choose a password different from your current one.')).toBeTruthy();
  });
});
