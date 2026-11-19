import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AuthNavigator } from './AuthNavigator';
import { signUp, verifySignupOtp } from '../../common/auth/services/authService';

// Real NavigationContainer + AuthNavigator stack — proves RegisterScreen actually hands the
// email the user typed to VerifyOtpScreen via real route params, not just that
// each screen calls navigation.navigate with the right mocked arguments in isolation.

jest.mock('../../common/auth/services/authService', () => ({
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

    await renderWithQuery(
      <NavigationContainer>
        <AuthNavigator />
      </NavigationContainer>,
    );

    expect(await screen.findByRole('header', { name: 'Sign in' })).toBeTruthy();
    await fireEvent.press(screen.getByText('Create account'));
    // SRDS §4: the four account types first, then the chosen one's form (A3b).
    await fireEvent.press(await screen.findByText('Dealer'));
    expect(await screen.findByText('Create a dealer account')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Farmer Test');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
    await fireEvent.changeText(screen.getByLabelText('Phone'), '0300 1234567');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'farmer@example.com',
      password: 'secret123',
      fullName: 'Farmer Test',
      role: 'dealer',
      phone: '+923001234567',
    });

    expect(await screen.findByText('Check your email')).toBeTruthy();
    expect(screen.getByText(/A code to confirm your account was sent to farmer@example.com/)).toBeTruthy();

    // The sixth digit submits the code.
    await fireEvent.changeText(screen.getByLabelText('Code from your email'), '123456');

    expect(mockVerify).toHaveBeenCalledWith('farmer@example.com', '123456');
  });
});
