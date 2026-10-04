import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { AuthApiError } from '@supabase/supabase-js';
import { ChangePasswordScreen } from './ChangePasswordScreen';
import { requestReauthentication, updatePassword } from '../services/profileService';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';

jest.mock('../services/profileService', () => ({
  updatePassword: jest.fn(),
  requestReauthentication: jest.fn(),
}));

const mockUpdatePassword = updatePassword as jest.Mock;
const mockReauthenticate = requestReauthentication as jest.Mock;
const NEEDS_CODE = new AuthApiError('Reauthentication needed', 400, 'reauthentication_needed');

function makeNavigation() {
  return { goBack: jest.fn() } as unknown as ProfileScreenProps<'ChangePassword'>['navigation'];
}

async function chooseNewPassword(password = 'secret123', confirm = password) {
  await fireEvent.changeText(screen.getByLabelText('New password'), password);
  await fireEvent.changeText(screen.getByLabelText('Confirm new password'), confirm);
  await fireEvent.press(screen.getByText('Update Password'));
}

beforeEach(() => {
  mockUpdatePassword.mockReset();
  mockReauthenticate.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ChangePasswordScreen', () => {
  it('renders the password fields', async () => {
    await renderWithQuery(<ChangePasswordScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByLabelText('New password')).toBeTruthy();
    expect(screen.getByLabelText('Confirm new password')).toBeTruthy();
  });

  it.each(['abc12', 'abcdefgh'])("refuses %s before calling Supabase (Supabase's password rule)", async password => {
    await renderWithQuery(<ChangePasswordScreen navigation={makeNavigation()} route={{} as never} />);
    await chooseNewPassword(password);

    expect(await screen.findByText('Use at least 8 characters, with letters and numbers')).toBeTruthy();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('shows a validation error when passwords do not match', async () => {
    await renderWithQuery(<ChangePasswordScreen navigation={makeNavigation()} route={{} as never} />);
    await chooseNewPassword('secret123', 'different1');

    expect(await screen.findByText("Passwords don't match")).toBeTruthy();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('changes the password at once for a recent session, with no code (Supabase would not check one)', async () => {
    mockUpdatePassword.mockResolvedValue(undefined);
    const navigation = makeNavigation();
    await renderWithQuery(<ChangePasswordScreen navigation={navigation} route={{} as never} />);
    await chooseNewPassword();

    expect(mockUpdatePassword).toHaveBeenCalledWith('secret123');
    expect(mockReauthenticate).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Password updated', 'Your password has been changed.');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('asks for the emailed code when Supabase requires it, then changes the password with it', async () => {
    mockUpdatePassword.mockRejectedValueOnce(NEEDS_CODE).mockResolvedValueOnce(undefined);
    mockReauthenticate.mockResolvedValue(undefined);
    const navigation = makeNavigation();
    await renderWithQuery(<ChangePasswordScreen navigation={navigation} route={{} as never} />);
    await chooseNewPassword();

    expect(mockReauthenticate).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(await screen.findByLabelText('Code'), '123456');
    await fireEvent.press(screen.getByText('Confirm new password'));

    expect(mockUpdatePassword).toHaveBeenLastCalledWith('secret123', '123456');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('says so when the code is wrong or expired, and stays on the code step', async () => {
    mockUpdatePassword
      .mockRejectedValueOnce(NEEDS_CODE)
      .mockRejectedValueOnce(new AuthApiError('Invalid nonce', 422, 'reauthentication_not_valid'));
    mockReauthenticate.mockResolvedValue(undefined);
    const navigation = makeNavigation();
    await renderWithQuery(<ChangePasswordScreen navigation={navigation} route={{} as never} />);
    await chooseNewPassword();
    await fireEvent.changeText(await screen.findByLabelText('Code'), '000000');
    await fireEvent.press(screen.getByText('Confirm new password'));

    expect(await screen.findByText('That code is wrong or has expired. Send a new one and try again.')).toBeTruthy();
    expect(screen.getByLabelText('Code')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Send a new code'));
    expect(mockReauthenticate).toHaveBeenCalledTimes(2);
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
