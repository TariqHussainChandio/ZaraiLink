import React from 'react';
import { AuthApiError } from '@supabase/supabase-js';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { ChangeEmailScreen } from './ChangeEmailScreen';
import { confirmEmailChangeCode, requestEmailChange } from '../services/profileService';
import { useAuthStore } from '../../../state/authStore';

jest.mock('../services/profileService', () => ({
  requestEmailChange: jest.fn(),
  confirmEmailChangeCode: jest.fn(),
}));

const mockRequest = requestEmailChange as jest.Mock;
const mockConfirm = confirmEmailChangeCode as jest.Mock;

const CURRENT = 'Code sent to admin@zarailink.test';
const NEW = 'Code sent to ops@zarailink.test';

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'admin-1', email: 'admin@zarailink.test' } as never });
});

async function sendCodes() {
  await fireEvent.changeText(screen.getByLabelText('New email'), 'ops@zarailink.test');
  await fireEvent.press(screen.getByText('Send codes'));
}

describe('ChangeEmailScreen (A3b)', () => {
  it('refuses the same address or an invalid one before asking Supabase', async () => {
    await renderWithQuery(<ChangeEmailScreen />);
    await fireEvent.changeText(screen.getByLabelText('New email'), 'admin@zarailink.test');
    await fireEvent.press(screen.getByText('Send codes'));
    expect(screen.getByText('Enter a different, valid email address')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('New email'), 'not-an-email');
    await fireEvent.press(screen.getByText('Send codes'));
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('asks for the code from each address, the current one first, then confirms the change', async () => {
    mockRequest.mockResolvedValue(undefined);
    mockConfirm.mockResolvedValue(undefined);
    await renderWithQuery(<ChangeEmailScreen />);
    await sendCodes();

    expect(mockRequest).toHaveBeenCalledWith('ops@zarailink.test');
    expect(await screen.findByText(/A 6-digit code was sent to admin@zarailink.test and another to ops@zarailink.test/)).toBeTruthy();
    // Each code is a one-time-code field that takes a paste and autofill (AU-02).
    expect(screen.getByLabelText(CURRENT).props.autoComplete).toBe('one-time-code');
    await fireEvent.changeText(screen.getByLabelText(CURRENT), '111111');
    await fireEvent.changeText(screen.getByLabelText(NEW), '222222');
    await fireEvent.press(screen.getByText('Change email'));

    expect(mockConfirm).toHaveBeenNthCalledWith(1, 'admin@zarailink.test', '111111');
    expect(mockConfirm).toHaveBeenNthCalledWith(2, 'ops@zarailink.test', '222222');
    expect(await screen.findByText('Sign in with ops@zarailink.test from now on.')).toBeTruthy();
  });

  it('needs both codes, and says which one is missing under that field', async () => {
    mockRequest.mockResolvedValue(undefined);
    await renderWithQuery(<ChangeEmailScreen />);
    await sendCodes();
    await fireEvent.changeText(await screen.findByLabelText(CURRENT), '111111');
    await fireEvent.press(screen.getByText('Change email'));
    expect(screen.getAllByText('Enter the 6-digit code')).toHaveLength(1);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('shows a refused first code under the first field, not the second (AU-21)', async () => {
    mockRequest.mockResolvedValue(undefined);
    mockConfirm.mockRejectedValue(new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'));
    await renderWithQuery(<ChangeEmailScreen />);
    await sendCodes();
    await fireEvent.changeText(await screen.findByLabelText(CURRENT), '111111');
    await fireEvent.changeText(screen.getByLabelText(NEW), '222222');
    await fireEvent.press(screen.getByText('Change email'));

    expect(await screen.findByText('This code has expired. Ask for a new one.')).toBeTruthy();
    expect(screen.getAllByText('This code has expired. Ask for a new one.')).toHaveLength(1);
    expect(screen.queryByText('Token has expired or is invalid')).toBeNull();
    expect(screen.queryByText(/from now on/)).toBeNull();
    // The second code was never tried: the first one failed.
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it('retries only the second code after the first was accepted (a code can be used once)', async () => {
    mockRequest.mockResolvedValue(undefined);
    mockConfirm
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new AuthApiError('invalid', 403, 'invalid_credentials'))
      .mockResolvedValueOnce(undefined);
    await renderWithQuery(<ChangeEmailScreen />);
    await sendCodes();
    await fireEvent.changeText(await screen.findByLabelText(CURRENT), '111111');
    await fireEvent.changeText(screen.getByLabelText(NEW), '222222');
    await fireEvent.press(screen.getByText('Change email'));
    expect(await screen.findByText('That code is not right. Check it, or ask for a new one.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(NEW), '333333');
    await fireEvent.press(screen.getByText('Change email'));
    expect(await screen.findByText('Sign in with ops@zarailink.test from now on.')).toBeTruthy();
    expect(mockConfirm).toHaveBeenNthCalledWith(3, 'ops@zarailink.test', '333333');
    expect(mockConfirm).toHaveBeenCalledTimes(3);
  });

  it('shows a request that failed as a plain message, not the SDK text (AU-21)', async () => {
    mockRequest.mockRejectedValue(new TypeError('Network request failed'));
    await renderWithQuery(<ChangeEmailScreen />);
    await sendCodes();
    expect(await screen.findByText('No connection. Check your internet, then try again.')).toBeTruthy();
  });
});
