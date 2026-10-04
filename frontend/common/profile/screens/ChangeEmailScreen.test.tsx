import React from 'react';
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
    expect(await screen.findByText(/We sent a 6-digit code to admin@zarailink.test and another to ops@zarailink.test/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Code sent to admin@zarailink.test'), '111111');
    await fireEvent.changeText(screen.getByLabelText('Code sent to ops@zarailink.test'), '222222');
    await fireEvent.press(screen.getByText('Change email'));

    expect(mockConfirm).toHaveBeenNthCalledWith(1, 'admin@zarailink.test', '111111');
    expect(mockConfirm).toHaveBeenNthCalledWith(2, 'ops@zarailink.test', '222222');
    expect(await screen.findByText('Sign in with ops@zarailink.test from now on.')).toBeTruthy();
  });

  it('needs both codes, and shows a refused code instead of claiming success', async () => {
    mockRequest.mockResolvedValue(undefined);
    mockConfirm.mockRejectedValue(new Error('Token has expired or is invalid'));
    await renderWithQuery(<ChangeEmailScreen />);
    await sendCodes();
    await fireEvent.changeText(await screen.findByLabelText('Code sent to admin@zarailink.test'), '111111');
    await fireEvent.press(screen.getByText('Change email'));
    expect(screen.getByText('Enter both 6-digit codes')).toBeTruthy();
    expect(mockConfirm).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Code sent to ops@zarailink.test'), '222222');
    await fireEvent.press(screen.getByText('Change email'));
    expect(await screen.findByText('Token has expired or is invalid')).toBeTruthy();
    expect(screen.queryByText(/from now on/)).toBeNull();
  });
});
