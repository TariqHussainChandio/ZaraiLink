import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { DeleteAccountScreen } from './DeleteAccountScreen';
import { deleteOwnAccount } from '../services/profileService';
import { useLoginNotice } from '../../auth';
import { ApiError } from '../../../services/api/errors';

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
  useLoginNotice.setState({ notice: null });
});

async function askToDelete(password: string) {
  await fireEvent.changeText(screen.getByLabelText('Your password'), password);
  await fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
}

describe('DeleteAccountScreen', () => {
  it('requires a password before asking', async () => {
    await renderWithQuery(<DeleteAccountScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));

    expect((await screen.findAllByText('Enter your password to confirm')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Delete your account?')).toBeNull();
  });

  it('says what happens in the words of what happens: the account is deleted, not "deactivated"', async () => {
    await renderWithQuery(<DeleteAccountScreen />);
    expect(screen.getByText(/permanently deletes your account/)).toBeTruthy();
    expect(screen.queryByText(/deactivates/)).toBeNull();
  });

  it('asks in a sheet, then deletes the account, leaves a notice for sign-in and signs out', async () => {
    mockDeleteOwnAccount.mockResolvedValue(undefined);
    await renderWithQuery(<DeleteAccountScreen />);
    await askToDelete('secret123');

    expect(await screen.findByText('Delete your account?')).toBeTruthy();
    // Nothing is deleted by the first tap.
    expect(mockDeleteOwnAccount).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mockDeleteOwnAccount).toHaveBeenCalledWith('secret123');
    expect(useLoginNotice.getState().notice?.title).toBe('Account deleted');
  });

  it('puts a wrong password on the password field, closes the sheet and does not sign out (AU-19)', async () => {
    mockDeleteOwnAccount.mockRejectedValue(
      new ApiError({ status: 401, code: 'incorrect_password', kind: 'auth', message: 'Incorrect password.' }),
    );
    await renderWithQuery(<DeleteAccountScreen />);
    await askToDelete('wrong-password');
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete account' }));

    expect(await screen.findByText('That password is not correct.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Delete your account?')).toBeNull());
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(useLoginNotice.getState().notice).toBeNull();
  });

  it('keeps the sheet open with the reason when the deletion fails for another reason', async () => {
    mockDeleteOwnAccount.mockRejectedValue(new TypeError('Network request failed'));
    await renderWithQuery(<DeleteAccountScreen />);
    await askToDelete('secret123');
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete account' }));

    expect(await screen.findByText('No connection. Check your internet, then try again.')).toBeTruthy();
    expect(screen.getByText('Delete your account?')).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
