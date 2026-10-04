import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AuthApiError } from '@supabase/supabase-js';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { SecondFactorScreen } from './SecondFactorScreen';
import { verifySecondFactor } from '../services/mfaService';
import { useAuthStore } from '../../../state/authStore';

jest.mock('../services/mfaService', () => ({ verifySecondFactor: jest.fn() }));

const mockVerify = verifySecondFactor as jest.Mock;

beforeEach(() => {
  mockVerify.mockReset();
});

describe('SecondFactorScreen (A3a verification round 1, H1)', () => {
  it('verifies the authenticator code', async () => {
    mockVerify.mockResolvedValue(undefined);
    await renderWithQuery(<SecondFactorScreen />);
    expect(screen.getByRole('header', { name: 'Two-step verification' })).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Authentication code'), '123456');
    await fireEvent.press(screen.getByText('Verify'));

    await waitFor(() => expect(mockVerify).toHaveBeenCalledWith('123456'));
  });

  it('says so when the code is wrong', async () => {
    mockVerify.mockRejectedValue(new AuthApiError('Invalid TOTP code entered', 422, 'mfa_verification_failed'));
    await renderWithQuery(<SecondFactorScreen />);
    await fireEvent.changeText(screen.getByLabelText('Authentication code'), '000000');
    await fireEvent.press(screen.getByText('Verify'));

    expect(await screen.findByText("That code isn't right. Check your app and try again.")).toBeTruthy();
    expect(screen.queryByText('Invalid TOTP code entered')).toBeNull();
  });

  it('signs out', async () => {
    const signOut = jest.fn(() => Promise.resolve());
    useAuthStore.setState({ signOut });
    await renderWithQuery(<SecondFactorScreen />);
    await fireEvent.press(screen.getByText('Sign out'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
