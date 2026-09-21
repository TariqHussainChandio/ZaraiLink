import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../localization';
import { AuthNavigator } from './AuthNavigator';
import { signUp, verifySignupOtp } from '../../services/modules/auth/authService';

// Real NavigationContainer + AuthNavigator stack — proves RegisterScreen actually hands the
// channel/identifier the user typed to VerifyOtpScreen via real route params, not just that
// each screen calls navigation.navigate with the right mocked arguments in isolation.

jest.mock('../../services/modules/auth/authService', () => ({
  signIn: jest.fn(),
  signUp: jest.fn(),
  verifySignupOtp: jest.fn(),
  resendSignupOtp: jest.fn(),
  resetPassword: jest.fn(),
}));

const mockSignUp = signUp as jest.Mock;
const mockVerify = verifySignupOtp as jest.Mock;

beforeEach(() => {
  mockSignUp.mockReset();
  mockVerify.mockReset();
});

describe('Auth flow: register -> verify OTP', () => {
  it('carries the exact email typed at registration through to the verification screen', async () => {
    mockSignUp.mockResolvedValue({ session: null });

    await render(
      <NavigationContainer>
        <AuthNavigator />
      </NavigationContainer>,
    );

    expect(await screen.findByText('Welcome back')).toBeTruthy();
    await fireEvent.press(screen.getByText(' Sign up'));

    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Farmer Test');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await fireEvent.press(screen.getByText('Farmer'));
    await fireEvent.press(screen.getByText('Create account'));

    expect(mockSignUp).toHaveBeenCalledWith({
      channel: 'email',
      identifier: 'farmer@example.com',
      password: 'secret123',
      fullName: 'Farmer Test',
      role: 'farmer',
    });

    expect(await screen.findByText('Verify your email')).toBeTruthy();
    expect(screen.getByText(/We sent a verification code to farmer@example.com/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Verification code'), '123456');
    await fireEvent.press(screen.getByText('Verify'));

    expect(mockVerify).toHaveBeenCalledWith('email', 'farmer@example.com', '123456');
  });
});
