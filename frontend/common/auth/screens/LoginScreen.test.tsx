import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { AuthApiError } from '@supabase/supabase-js';
import { LoginScreen } from './LoginScreen';
import { signIn } from '../services/authService';
import { AUTH_ROUTES } from '../../constants/routes';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

jest.mock('../services/authService', () => ({
  signIn: jest.fn(),
}));

const mockSignIn = signIn as jest.Mock;

function makeNavigation() {
  return { navigate: jest.fn(), goBack: jest.fn() } as unknown as AuthScreenProps<'Login'>['navigation'];
}

describe('LoginScreen', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
  });

  it('asks for an email and a password only (phone sign-in is off)', async () => {
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.queryByText('Phone number')).toBeNull();
  });

  it('submits email + password and calls signIn', async () => {
    mockSignIn.mockResolvedValue(undefined);
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await fireEvent.press(screen.getByText('Sign In'));

    expect(mockSignIn).toHaveBeenCalledWith({ email: 'farmer@example.com', password: 'secret123' });
  });

  it('shows the submit error when signIn rejects', async () => {
    mockSignIn.mockRejectedValue(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'));
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrongpass');
    await fireEvent.press(screen.getByText('Sign In'));

    expect(await screen.findByText('Incorrect email or password.')).toBeTruthy();
    expect(screen.queryByText('Invalid login credentials')).toBeNull();
  });

  it('refuses a malformed email before calling Supabase', async () => {
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await fireEvent.press(screen.getByText('Sign In'));
    expect(await screen.findByText('Enter a valid email')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('navigates to account creation and ForgotPassword', async () => {
    const navigation = makeNavigation();
    await renderWithQuery(<LoginScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByText('Forgot your password?'));
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.ForgotPassword);
    await fireEvent.press(screen.getByText(' Sign up'));
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.CreateAccount);
  });
});
