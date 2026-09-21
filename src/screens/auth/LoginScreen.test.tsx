import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../localization';
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
    await render(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('submits email + password and calls signIn', async () => {
    mockSignIn.mockResolvedValue(undefined);
    await render(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
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
    mockSignIn.mockRejectedValue(new Error('Invalid login credentials'));
    await render(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrongpass');
    await fireEvent.press(screen.getByText('Sign In'));

    expect(await screen.findByText('Invalid login credentials')).toBeTruthy();
  });

  it('switches to the phone channel and back', async () => {
    await render(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.press(screen.getByText('Phone number'));
    expect(screen.queryByLabelText('Email')).toBeNull();
    await fireEvent.press(screen.getByText('Email'));
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it('navigates to Register and ForgotPassword', async () => {
    const navigation = makeNavigation();
    await render(<LoginScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByText('Forgot your password?'));
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.ForgotPassword);
    await fireEvent.press(screen.getByText(' Sign up'));
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.Register);
  });
});
