import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { AuthApiError } from '@supabase/supabase-js';
import { ChangePasswordScreen } from './ChangePasswordScreen';
import { requestReauthentication, updatePassword } from '../services/profileService';
import { PASSWORD_HELPER } from '../../validation/password';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';

jest.mock('../services/profileService', () => ({
  updatePassword: jest.fn(),
  requestReauthentication: jest.fn(),
}));

const mockUpdatePassword = updatePassword as jest.Mock;
const mockReauthenticate = requestReauthentication as jest.Mock;
const NEEDS_CODE = new AuthApiError('Reauthentication needed', 400, 'reauthentication_needed');
const CODE = 'Code from your email';

function makeNavigation() {
  return { goBack: jest.fn() } as unknown as ProfileScreenProps<'ChangePassword'>['navigation'];
}

async function chooseNewPassword(password = 'secret123') {
  await fireEvent.changeText(screen.getByLabelText('New password'), password);
  await fireEvent.press(screen.getByRole('button', { name: 'Update password' }));
}

beforeEach(() => {
  mockUpdatePassword.mockReset();
  mockReauthenticate.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ChangePasswordScreen', () => {
  it('asks for the new password once, with Show and the shared rule as its helper', async () => {
    await renderWithQuery(<ChangePasswordScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByLabelText('New password')).toBeTruthy();
    expect(screen.getByLabelText('Show password')).toBeTruthy();
    expect(screen.getByText(PASSWORD_HELPER)).toBeTruthy();
    expect(screen.getByLabelText('New password').props.autoComplete).toBe('new-password');
  });

  it.each(['abc12', 'abcdefgh', '12345678'])("refuses %s before calling Supabase (Supabase's password rule)", async password => {
    await renderWithQuery(<ChangePasswordScreen navigation={makeNavigation()} route={{} as never} />);
    await chooseNewPassword(password);

    expect((await screen.findAllByText(PASSWORD_HELPER)).length).toBeGreaterThan(0);
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('changes the password at once for a recent session, with no code (Supabase would not check one)', async () => {
    mockUpdatePassword.mockResolvedValue(undefined);
    const navigation = makeNavigation();
    await renderWithQuery(<ChangePasswordScreen navigation={navigation} route={{} as never} />);
    await chooseNewPassword();

    expect(mockUpdatePassword).toHaveBeenCalledWith('secret123');
    expect(mockReauthenticate).not.toHaveBeenCalled();
    // The confirmation is a snackbar over the screen the person lands on, not an Alert.
    expect(await screen.findByText('Password updated')).toBeTruthy();
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('asks for the emailed code when Supabase requires it, then changes the password with it', async () => {
    mockUpdatePassword.mockRejectedValueOnce(NEEDS_CODE).mockResolvedValueOnce(undefined);
    mockReauthenticate.mockResolvedValue(undefined);
    const navigation = makeNavigation();
    await renderWithQuery(<ChangePasswordScreen navigation={navigation} route={{} as never} />);
    await chooseNewPassword();

    expect(mockReauthenticate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Check your spam folder. The code works for 15 minutes.')).toBeTruthy();
    // The last digit confirms by itself.
    await fireEvent.changeText(screen.getByLabelText(CODE), '123456');

    expect(mockUpdatePassword).toHaveBeenLastCalledWith('secret123', '123456');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('says so under the code when it is wrong or expired, and stays on the code step', async () => {
    mockUpdatePassword
      .mockRejectedValueOnce(NEEDS_CODE)
      .mockRejectedValueOnce(new AuthApiError('Invalid nonce', 422, 'reauthentication_not_valid'));
    mockReauthenticate.mockResolvedValue(undefined);
    const navigation = makeNavigation();
    await renderWithQuery(<ChangePasswordScreen navigation={navigation} route={{} as never} />);
    await chooseNewPassword();
    await fireEvent.changeText(await screen.findByLabelText(CODE), '000000');

    expect(await screen.findByText('That code is wrong or has expired. Send a new one and try again.')).toBeTruthy();
    expect(screen.getByLabelText(CODE)).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('waits 60 seconds before a new code, then sends it and shows the result on its own line (AU-03)', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockUpdatePassword.mockRejectedValueOnce(NEEDS_CODE);
    mockReauthenticate.mockResolvedValue(undefined);
    await renderWithQuery(<ChangePasswordScreen navigation={makeNavigation()} route={{} as never} />);
    await chooseNewPassword();

    expect(await screen.findByText('Send a new code in 1:00')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send a new code' })).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Send a new code' }));
    expect(mockReauthenticate).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('New code sent. The old one no longer works.')).toBeTruthy();
  });

  it('shows the submit error when updatePassword rejects for another reason', async () => {
    mockUpdatePassword.mockRejectedValue(new AuthApiError('New password should be different', 422, 'same_password'));
    const navigation = makeNavigation();
    await renderWithQuery(<ChangePasswordScreen navigation={navigation} route={{} as never} />);
    await chooseNewPassword();

    expect(await screen.findByText('Choose a password different from your current one.')).toBeTruthy();
    expect(screen.queryByText('New password should be different')).toBeNull();
    expect(mockReauthenticate).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
