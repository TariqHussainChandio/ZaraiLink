import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { resetPassword } from '../services/authService';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

jest.mock('../services/authService', () => ({
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

  it('sends the reset code and navigates to enter it', async () => {
    mockResetPassword.mockResolvedValue(undefined);
    const navigation = makeNavigation();
    await renderWithQuery(<ForgotPasswordScreen navigation={navigation} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
    await fireEvent.press(screen.getByText('Send code'));

    expect(mockResetPassword).toHaveBeenCalledWith('farmer@example.com');
    expect(navigation.navigate).toHaveBeenCalledWith('VerifyOtp', {
      purpose: 'recovery',
      identifier: 'farmer@example.com',
    });
  });

  it('shows the submit error when resetPassword rejects', async () => {
    mockResetPassword.mockRejectedValue(new Error('no such user'));
    const navigation = makeNavigation();
    await renderWithQuery(<ForgotPasswordScreen navigation={navigation} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'missing@example.com');
    await fireEvent.press(screen.getByText('Send code'));

    // An error the app does not recognise shows the screen's own message, never the raw text.
    expect(await screen.findByText('Failed to send reset email')).toBeTruthy();
    expect(screen.queryByText('no such user')).toBeNull();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('shows a client-side validation error for an invalid email and never calls resetPassword', async () => {
    // Regression test: an @hookform/resolvers v3 + zod v4 version mismatch made every
    // zodResolver-based form throw a raw ZodError on invalid input instead of surfacing a
    // field error (fixed by upgrading @hookform/resolvers to v5, which supports zod v4).
    await renderWithQuery(<ForgotPasswordScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');
    await fireEvent.press(screen.getByText('Send code'));

    expect(await screen.findByText('Enter a valid email')).toBeTruthy();
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('goes back to sign in', async () => {
    const navigation = makeNavigation();
    await renderWithQuery(<ForgotPasswordScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByText('Back to sign in'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
