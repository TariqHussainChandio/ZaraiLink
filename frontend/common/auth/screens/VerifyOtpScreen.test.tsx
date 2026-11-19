import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { AuthApiError, AuthError } from '@supabase/supabase-js';
import { VerifyOtpScreen } from './VerifyOtpScreen';
import {
  resendRecoveryOtp,
  resendSignupOtp,
  verifyRecoveryOtp,
  verifySignupOtp,
} from '../services/authService';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

jest.mock('../services/authService', () => ({
  verifySignupOtp: jest.fn(),
  resendSignupOtp: jest.fn(),
  verifyRecoveryOtp: jest.fn(),
  resendRecoveryOtp: jest.fn(),
}));

const mockVerify = verifySignupOtp as jest.Mock;
const mockResend = resendSignupOtp as jest.Mock;
const mockVerifyRecovery = verifyRecoveryOtp as jest.Mock;
const mockResendRecovery = resendRecoveryOtp as jest.Mock;

const CODE = 'Code from your email';

function makeProps() {
  return {
    navigation: { navigate: jest.fn(), goBack: jest.fn() },
    route: { params: { purpose: 'signup' as const, email: 'farmer@example.com' } },
  } as unknown as AuthScreenProps<'VerifyOtp'>;
}

function makeRecoveryProps() {
  return {
    navigation: { navigate: jest.fn(), goBack: jest.fn() },
    route: { params: { purpose: 'recovery' as const, email: 'farmer@example.com' } },
  } as unknown as AuthScreenProps<'VerifyOtp'>;
}

// The wait before a new code may be asked for starts when the screen opens (Supabase allows one email a minute).
async function waitOutCooldown() {
  await act(async () => {
    jest.advanceTimersByTime(60_000);
  });
}

describe('VerifyOtpScreen — signup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the email the code was sent to and disables Verify until a full code is entered', async () => {
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    expect(screen.getByText(/farmer@example.com/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
  });

  it('says to check spam and how long the code works (AU-03)', async () => {
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    expect(screen.getByText('Check your spam folder. The code works for 15 minutes.')).toBeTruthy();
  });

  it('stays disabled for a partial code and enables once all 6 digits are entered', async () => {
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    await fireEvent.changeText(screen.getByLabelText(CODE), '123');
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();

    mockVerify.mockResolvedValue(undefined);
    await fireEvent.changeText(screen.getByLabelText(CODE), '12345');
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
  });

  it('takes the digits out of a pasted sentence and caps them at 6 (AU-02)', async () => {
    mockVerify.mockResolvedValue(undefined);
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    // No maxLength on the input: Android would cut a paste to "Your c" before any filter ran.
    expect(screen.getByLabelText(CODE).props.maxLength).toBeUndefined();
    await fireEvent.changeText(screen.getByLabelText(CODE), 'Your code is: 123 456 !');
    expect(screen.getByLabelText(CODE).props.value).toBe('123456');
  });

  it('asks the keyboard and password manager for the one-time code', async () => {
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    expect(screen.getByLabelText(CODE).props.autoComplete).toBe('one-time-code');
  });

  it('verifies the entered code', async () => {
    mockVerify.mockResolvedValue(undefined);
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    await fireEvent.changeText(screen.getByLabelText(CODE), '12345');
    await fireEvent.changeText(screen.getByLabelText(CODE), '123456');
    // The last digit submits by itself, once.
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledWith('farmer@example.com', '123456');
  });

  it('maps a known GoTrue error code to readable copy instead of the raw message', async () => {
    mockVerify.mockRejectedValue(new AuthError('otp_expired', 403, 'otp_expired'));
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    await fireEvent.changeText(screen.getByLabelText(CODE), '000000');

    expect(await screen.findByText('This code has expired. Ask for a new one.')).toBeTruthy();
  });

  it('falls back to a plain message for an unrecognized error, never the raw text', async () => {
    mockVerify.mockRejectedValue(new Error('relation "profiles" does not exist'));
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    await fireEvent.changeText(screen.getByLabelText(CODE), '000000');

    expect(await screen.findByText('That code did not work. Check it, or ask for a new one.')).toBeTruthy();
    expect(screen.queryByText('relation "profiles" does not exist')).toBeNull();
  });

  it('counts down 60 seconds as text from the moment it opens, and offers no resend button before then (AU-03)', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    expect(screen.getByText('Resend code in 1:00')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resend code' })).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(18_000);
    });
    expect(screen.getByText('Resend code in 0:42')).toBeTruthy();
  });

  it('resends once the wait is over, says so on its own line, and starts the wait again', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockResend.mockResolvedValue(undefined);
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    await waitOutCooldown();
    await fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));

    expect(mockResend).toHaveBeenCalledWith('farmer@example.com');
    expect(await screen.findByText('New code sent. The old one no longer works.')).toBeTruthy();
    expect(screen.getByText('Resend code in 1:00')).toBeTruthy();
  });

  it('shows a failed resend on its own line and leaves the code field free of it', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockResend.mockRejectedValue(new AuthApiError('rate', 429, 'over_email_send_rate_limit'));
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    await waitOutCooldown();
    await fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));

    expect(await screen.findByText('Too many attempts. Wait a moment before trying again.')).toBeTruthy();
    expect(screen.getByLabelText(CODE).props.accessibilityHint).not.toMatch(/Too many/);
  });

  it('stops counting when the screen goes away, without throwing', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    const { unmount } = await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    unmount();
    // If the interval were not cleared, this would eventually set state on an unmounted component.
    jest.advanceTimersByTime(61_000);
  });

  it('goes back to sign up', async () => {
    const props = makeProps();
    await renderWithQuery(<VerifyOtpScreen {...props} />);
    await fireEvent.press(screen.getByText('Back to sign up'));
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });
});

describe('VerifyOtpScreen — password recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows recovery-specific copy and calls verifyRecoveryOtp, not verifySignupOtp', async () => {
    mockVerifyRecovery.mockResolvedValue(undefined);
    await renderWithQuery(<VerifyOtpScreen {...makeRecoveryProps()} />);

    expect(screen.getByText('Enter your reset code')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(CODE), '654321');

    expect(mockVerifyRecovery).toHaveBeenCalledWith('farmer@example.com', '654321');
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('resends via resendRecoveryOtp', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockResendRecovery.mockResolvedValue(undefined);
    await renderWithQuery(<VerifyOtpScreen {...makeRecoveryProps()} />);
    await waitOutCooldown();
    await fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));

    expect(mockResendRecovery).toHaveBeenCalledWith('farmer@example.com');
    expect(mockResend).not.toHaveBeenCalled();
  });
});
