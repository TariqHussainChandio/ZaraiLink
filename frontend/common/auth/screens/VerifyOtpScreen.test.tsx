import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AuthError } from '@supabase/supabase-js';
import { VerifyOtpScreen } from './VerifyOtpScreen';
import {
  resendRecoveryOtp,
  resendSignupOtp,
  verifyRecoveryOtp,
  verifySignupOtp,
} from '../../services/modules/auth/authService';
import type { AuthScreenProps } from '../../navigation/stacks/AuthNavigator';

jest.mock('../../services/modules/auth/authService', () => ({
  verifySignupOtp: jest.fn(),
  resendSignupOtp: jest.fn(),
  verifyRecoveryOtp: jest.fn(),
  resendRecoveryOtp: jest.fn(),
}));

const mockVerify = verifySignupOtp as jest.Mock;
const mockResend = resendSignupOtp as jest.Mock;
const mockVerifyRecovery = verifyRecoveryOtp as jest.Mock;
const mockResendRecovery = resendRecoveryOtp as jest.Mock;

function makeProps() {
  return {
    navigation: { navigate: jest.fn(), goBack: jest.fn() },
    route: { params: { purpose: 'signup' as const, channel: 'email' as const, identifier: 'farmer@example.com' } },
  } as unknown as AuthScreenProps<'VerifyOtp'>;
}

function makeRecoveryProps() {
  return {
    navigation: { navigate: jest.fn(), goBack: jest.fn() },
    route: { params: { purpose: 'recovery' as const, identifier: 'farmer@example.com' } },
  } as unknown as AuthScreenProps<'VerifyOtp'>;
}

describe('VerifyOtpScreen — signup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the identifier the code was sent to and disables Verify until a full code is entered', async () => {
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    expect(screen.getByText(/farmer@example.com/)).toBeTruthy();
    expect(screen.getByText('Verify').parent?.props.accessibilityState.disabled).toBe(true);
  });

  it('stays disabled for a partial code and enables once all 6 digits are entered', async () => {
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    await fireEvent.changeText(screen.getByLabelText('Verification code'), '123');
    expect(screen.getByText('Verify').parent?.props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByLabelText('Verification code'), '123456');
    expect(screen.getByText('Verify').parent?.props.accessibilityState.disabled).toBe(false);
  });

  it('strips non-digit characters from a pasted value and caps it at 6 digits', async () => {
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    await fireEvent.changeText(screen.getByLabelText('Verification code'), 'Your code is: 123456!');
    expect(screen.getByLabelText('Verification code').props.value).toBe('123456');
  });

  it('verifies the entered code', async () => {
    mockVerify.mockResolvedValue(undefined);
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    await fireEvent.changeText(screen.getByLabelText('Verification code'), '123456');
    await fireEvent.press(screen.getByText('Verify'));

    expect(mockVerify).toHaveBeenCalledWith('email', 'farmer@example.com', '123456');
  });

  it('maps a known GoTrue error code to readable copy instead of the raw message', async () => {
    mockVerify.mockRejectedValue(new AuthError('otp_expired', 403, 'otp_expired'));
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    await fireEvent.changeText(screen.getByLabelText('Verification code'), '000000');
    await fireEvent.press(screen.getByText('Verify'));

    expect(await screen.findByText('This code has expired. Request a new one.')).toBeTruthy();
  });

  it('falls back to a generic message for an unrecognized error, never the raw text', async () => {
    mockVerify.mockRejectedValue(new Error('relation "profiles" does not exist'));
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    await fireEvent.changeText(screen.getByLabelText('Verification code'), '000000');
    await fireEvent.press(screen.getByText('Verify'));

    expect(await screen.findByText('Invalid or expired code')).toBeTruthy();
    expect(screen.queryByText('relation "profiles" does not exist')).toBeNull();
  });

  it('resends the code and starts the cooldown', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockResend.mockResolvedValue(undefined);
    await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    await fireEvent.press(screen.getByText('Resend code'));

    expect(mockResend).toHaveBeenCalledWith('email', 'farmer@example.com');
    expect(await screen.findByText(/Resend code in 30s/)).toBeTruthy();
  });

  it('clears the cooldown interval on unmount without throwing', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockResend.mockResolvedValue(undefined);
    const { unmount } = await renderWithQuery(<VerifyOtpScreen {...makeProps()} />);
    await fireEvent.press(screen.getByText('Resend code'));
    await screen.findByText(/Resend code in 30s/);

    unmount();
    // If the interval weren't cleared, this would eventually try to setState on an unmounted
    // component — advancing timers past the full cooldown proves it doesn't.
    jest.advanceTimersByTime(RESEND_COOLDOWN_MS);
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

  it('shows recovery-specific copy and calls verifyRecoveryOtp, not verifySignupOtp', async () => {
    mockVerifyRecovery.mockResolvedValue(undefined);
    await renderWithQuery(<VerifyOtpScreen {...makeRecoveryProps()} />);

    expect(screen.getByText('Enter your reset code')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Verification code'), '654321');
    await fireEvent.press(screen.getByText('Verify'));

    expect(mockVerifyRecovery).toHaveBeenCalledWith('farmer@example.com', '654321');
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('resends via resendRecoveryOtp', async () => {
    mockResendRecovery.mockResolvedValue(undefined);
    await renderWithQuery(<VerifyOtpScreen {...makeRecoveryProps()} />);
    await fireEvent.press(screen.getByText('Resend code'));

    expect(mockResendRecovery).toHaveBeenCalledWith('farmer@example.com');
    expect(mockResend).not.toHaveBeenCalled();
  });
});

const RESEND_COOLDOWN_MS = 31_000;
