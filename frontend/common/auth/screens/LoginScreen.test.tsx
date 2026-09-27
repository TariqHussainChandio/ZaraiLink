import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AuthApiError } from '@supabase/supabase-js';
import { LoginScreen } from './LoginScreen';
import { signIn } from '../../services/modules/auth/authService';
import { AUTH_ROUTES } from '../../constants/routes';
import type { AuthScreenProps } from '../../navigation/stacks/AuthNavigator';

jest.mock('../../services/modules/auth/authService', () => ({
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

  it('renders the email channel by default', async () => {
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('submits email + password and calls signIn', async () => {
    mockSignIn.mockResolvedValue(undefined);
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await fireEvent.press(screen.getByText('Sign In'));

    expect(mockSignIn).toHaveBeenCalledWith({
      channel: 'email',
      identifier: 'farmer@example.com',
      password: 'secret123',
    });
  });

  it('shows the submit error when signIn rejects', async () => {
    mockSignIn.mockRejectedValue(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'));
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrongpass');
    await fireEvent.press(screen.getByText('Sign In'));

    expect(await screen.findByText('Incorrect email, phone or password.')).toBeTruthy();
    expect(screen.queryByText('Invalid login credentials')).toBeNull();
  });

  it('switches to the phone channel and back', async () => {
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.press(screen.getByText('Phone number'));
    expect(screen.queryByLabelText('Email')).toBeNull();
    await fireEvent.press(screen.getByText('Email'));
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it('navigates to Register and ForgotPassword', async () => {
    const navigation = makeNavigation();
    await renderWithQuery(<LoginScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByText('Forgot your password?'));
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.ForgotPassword);
    await fireEvent.press(screen.getByText(' Sign up'));
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.Register);
  });
});
