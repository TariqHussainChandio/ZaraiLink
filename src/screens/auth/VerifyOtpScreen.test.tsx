import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { VerifyOtpScreen } from './VerifyOtpScreen';
import { resendSignupOtp, verifySignupOtp } from '../../services/modules/auth/authService';
import type { AuthScreenProps } from '../../navigation/stacks/AuthNavigator';

jest.mock('../../services/modules/auth/authService', () => ({
  verifySignupOtp: jest.fn(),
  resendSignupOtp: jest.fn(),
}));

const mockVerify = verifySignupOtp as jest.Mock;
const mockResend = resendSignupOtp as jest.Mock;

function makeProps() {
  return {
    navigation: { navigate: jest.fn(), goBack: jest.fn() },
    route: { params: { channel: 'email' as const, identifier: 'farmer@example.com' } },
  } as unknown as AuthScreenProps<'VerifyOtp'>;
}

describe('VerifyOtpScreen', () => {
  beforeEach(() => {
    mockVerify.mockReset();
    mockResend.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the identifier the code was sent to and disables Verify until a code is entered', async () => {
    await render(<VerifyOtpScreen {...makeProps()} />);
    expect(screen.getByText(/farmer@example.com/)).toBeTruthy();
    expect(screen.getByText('Verify').parent?.props.accessibilityState.disabled).toBe(true);
  });

  it('verifies the entered code', async () => {
    mockVerify.mockResolvedValue(undefined);
    await render(<VerifyOtpScreen {...makeProps()} />);
    await fireEvent.changeText(screen.getByLabelText('Verification code'), '123456');
    await fireEvent.press(screen.getByText('Verify'));

    expect(mockVerify).toHaveBeenCalledWith('email', 'farmer@example.com', '123456');
  });

  it('shows an error when verification fails', async () => {
    mockVerify.mockRejectedValue(new Error('Token has expired'));
    await render(<VerifyOtpScreen {...makeProps()} />);
    await fireEvent.changeText(screen.getByLabelText('Verification code'), '000000');
    await fireEvent.press(screen.getByText('Verify'));

    expect(await screen.findByText('Token has expired')).toBeTruthy();
  });

  it('resends the code and starts the cooldown', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockResend.mockResolvedValue(undefined);
    await render(<VerifyOtpScreen {...makeProps()} />);
    await fireEvent.press(screen.getByText('Resend code'));

    expect(mockResend).toHaveBeenCalledWith('email', 'farmer@example.com');
    expect(await screen.findByText(/Resend code in 30s/)).toBeTruthy();
  });

  it('goes back to sign up', async () => {
    const props = makeProps();
    await render(<VerifyOtpScreen {...props} />);
    await fireEvent.press(screen.getByText('Back to sign up'));
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
