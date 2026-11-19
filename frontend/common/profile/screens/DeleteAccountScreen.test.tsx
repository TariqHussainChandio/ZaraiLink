import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { DeleteAccountScreen } from './DeleteAccountScreen';
import { deleteOwnAccount } from '../services/profileService';

jest.mock('../services/profileService', () => ({
  deleteOwnAccount: jest.fn(),
}));

const mockSignOut = jest.fn();
jest.mock('../../../state/authStore', () => ({
  useAuthStore: (selector: (state: { signOut: () => Promise<void> }) => unknown) =>
    selector({ signOut: mockSignOut }),
}));

const mockDeleteOwnAccount = deleteOwnAccount as jest.Mock;

beforeEach(() => {
  mockDeleteOwnAccount.mockReset();
  mockSignOut.mockReset();
});

describe('DeleteAccountScreen', () => {
  it('requires a password before submitting', async () => {
    await renderWithQuery(<DeleteAccountScreen />);
    await fireEvent.press(screen.getByText('Delete my account'));

    expect(await screen.findByText('Enter your password to confirm')).toBeTruthy();
    expect(screen.queryByText('Delete your account?')).toBeNull();
  });

  it('asks in a confirmation sheet, then deletes the account and signs out on confirm', async () => {
    mockDeleteOwnAccount.mockResolvedValue(undefined);

    await renderWithQuery(<DeleteAccountScreen />);
    await fireEvent.changeText(screen.getByLabelText('Confirm your password'), 'secret123');
    await fireEvent.press(screen.getByText('Delete my account'));

    // Nothing is deleted until the sheet's Delete is pressed.
    expect(screen.getByText('Delete your account?')).toBeTruthy();
    expect(mockDeleteOwnAccount).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Delete'));

    expect(mockDeleteOwnAccount).toHaveBeenCalledWith('secret123');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('deletes nothing when the sheet is cancelled', async () => {
    await renderWithQuery(<DeleteAccountScreen />);
    await fireEvent.changeText(screen.getByLabelText('Confirm your password'), 'secret123');
    await fireEvent.press(screen.getByText('Delete my account'));
    await fireEvent.press(screen.getByText('Cancel'));

    expect(screen.queryByText('Delete your account?')).toBeNull();
    expect(mockDeleteOwnAccount).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('shows an error and does not sign out when the wrong password is given', async () => {
    mockDeleteOwnAccount.mockRejectedValue(new Error('Incorrect password.'));

    await renderWithQuery(<DeleteAccountScreen />);
    await fireEvent.changeText(screen.getByLabelText('Confirm your password'), 'wrong-password');
    await fireEvent.press(screen.getByText('Delete my account'));
    await fireEvent.press(screen.getByText('Delete'));

    expect(await screen.findByText('Incorrect password.')).toBeTruthy();
    expect(screen.queryByText('Delete your account?')).toBeNull();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
