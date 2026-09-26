import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { DeleteAccountScreen } from './DeleteAccountScreen';
import { deleteOwnAccount } from '../../services/modules/profile/profileService';

jest.mock('../../services/modules/profile/profileService', () => ({
  deleteOwnAccount: jest.fn(),
}));

const mockSignOut = jest.fn();
jest.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (state: { signOut: () => Promise<void> }) => unknown) =>
    selector({ signOut: mockSignOut }),
}));

const mockDeleteOwnAccount = deleteOwnAccount as jest.Mock;

beforeEach(() => {
  mockDeleteOwnAccount.mockReset();
  mockSignOut.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DeleteAccountScreen', () => {
  it('requires a password before submitting', async () => {
    await renderWithQuery(<DeleteAccountScreen />);
    await fireEvent.press(screen.getByText('Delete my account'));

    expect(await screen.findByText('Enter your password to confirm')).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('shows a confirmation alert, then deletes the account and signs out on confirm', async () => {
    mockDeleteOwnAccount.mockResolvedValue(undefined);
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) => {
        const confirm = buttons?.find(b => b.text === 'Delete');
        confirm?.onPress?.();
      });

    await renderWithQuery(<DeleteAccountScreen />);
    await fireEvent.changeText(screen.getByLabelText('Confirm your password'), 'secret123');
    await fireEvent.press(screen.getByText('Delete my account'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Delete your account?',
      expect.any(String),
      expect.any(Array),
    );
    expect(mockDeleteOwnAccount).toHaveBeenCalledWith('secret123');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('shows an error and does not sign out when the wrong password is given', async () => {
    mockDeleteOwnAccount.mockRejectedValue(new Error('Incorrect password.'));
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.find(b => b.text === 'Delete');
      confirm?.onPress?.();
    });

    await renderWithQuery(<DeleteAccountScreen />);
    await fireEvent.changeText(screen.getByLabelText('Confirm your password'), 'wrong-password');
    await fireEvent.press(screen.getByText('Delete my account'));

    expect(await screen.findByText('Incorrect password.')).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
