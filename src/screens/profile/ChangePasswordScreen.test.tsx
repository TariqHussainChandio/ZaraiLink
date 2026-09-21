import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../localization';
import { ChangePasswordScreen } from './ChangePasswordScreen';
import { updatePassword } from '../../services/modules/profile/profileService';
import type { ProfileScreenProps } from '../../navigation/stacks/ProfileNavigator';

jest.mock('../../services/modules/profile/profileService', () => ({
  updatePassword: jest.fn(),
}));

const mockUpdatePassword = updatePassword as jest.Mock;

function makeNavigation() {
  return { goBack: jest.fn() } as unknown as ProfileScreenProps<'ChangePassword'>['navigation'];
}

beforeEach(() => {
  mockUpdatePassword.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ChangePasswordScreen', () => {
  it('renders the password fields', async () => {
    await render(<ChangePasswordScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByLabelText('New password')).toBeTruthy();
    expect(screen.getByLabelText('Confirm new password')).toBeTruthy();
  });

  it('shows a validation error for a too-short password', async () => {
    await render(<ChangePasswordScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'abc');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'abc');
    await fireEvent.press(screen.getByText('Update Password'));

    expect(await screen.findByText('Password must be at least 6 characters')).toBeTruthy();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('shows a validation error when passwords do not match', async () => {
    await render(<ChangePasswordScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'secret123');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'different1');
    await fireEvent.press(screen.getByText('Update Password'));

    expect(await screen.findByText("Passwords don't match")).toBeTruthy();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('updates the password and navigates back on success', async () => {
    mockUpdatePassword.mockResolvedValue(undefined);
    const navigation = makeNavigation();
    await render(<ChangePasswordScreen navigation={navigation} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'secret123');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'secret123');
    await fireEvent.press(screen.getByText('Update Password'));

    expect(mockUpdatePassword).toHaveBeenCalledWith('secret123');
    expect(Alert.alert).toHaveBeenCalledWith('Password updated', 'Your password has been changed.');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows the submit error when updatePassword rejects', async () => {
    mockUpdatePassword.mockRejectedValue(new Error('Session expired'));
    const navigation = makeNavigation();
    await render(<ChangePasswordScreen navigation={navigation} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'secret123');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'secret123');
    await fireEvent.press(screen.getByText('Update Password'));

    expect(await screen.findByText('Session expired')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
