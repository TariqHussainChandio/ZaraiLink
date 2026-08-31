import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { resetPassword } from '../../services/modules/auth/authService';
import type { AuthScreenProps } from '../../navigation/stacks/AuthNavigator';

jest.mock('../../services/modules/auth/authService', () => ({
  resetPassword: jest.fn(),
}));

const mockResetPassword = resetPassword as jest.Mock;

function makeNavigation() {
  return { navigate: jest.fn(), goBack: jest.fn() } as unknown as AuthScreenProps<'ForgotPassword'>['navigation'];
}

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    mockResetPassword.mockReset();
  });

  it('sends the reset email and shows the success message', async () => {
    mockResetPassword.mockResolvedValue(undefined);
    await render(<ForgotPasswordScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
    await fireEvent.press(screen.getByText('Send reset link'));

    expect(mockResetPassword).toHaveBeenCalledWith('farmer@example.com');
    expect(await screen.findByText('Check your email for a password reset link.')).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('shows the submit error when resetPassword rejects', async () => {
    mockResetPassword.mockRejectedValue(new Error('no such user'));
    await render(<ForgotPasswordScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'missing@example.com');
    await fireEvent.press(screen.getByText('Send reset link'));

    expect(await screen.findByText('no such user')).toBeTruthy();
    expect(screen.queryByText('Check your email for a password reset link.')).toBeNull();
  });

  it('shows a client-side validation error for an invalid email and never calls resetPassword', async () => {
    // Regression test: an @hookform/resolvers v3 + zod v4 version mismatch made every
    // zodResolver-based form throw a raw ZodError on invalid input instead of surfacing a
    // field error (fixed by upgrading @hookform/resolvers to v5, which supports zod v4).
    await render(<ForgotPasswordScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');
    await fireEvent.press(screen.getByText('Send reset link'));

    expect(await screen.findByText('Enter a valid email')).toBeTruthy();
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('goes back to sign in', async () => {
    const navigation = makeNavigation();
    await render(<ForgotPasswordScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByText('Back to sign in'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
