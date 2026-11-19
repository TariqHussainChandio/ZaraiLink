import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { AuthApiError } from '@supabase/supabase-js';
import { LoginScreen } from './LoginScreen';
import { resendSignupOtp, signIn } from '../services/authService';
import { useLoginNotice } from '../state/loginNotice';
import { AUTH_ROUTES } from '../../constants/routes';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

jest.mock('../services/authService', () => ({
  signIn: jest.fn(),
  resendSignupOtp: jest.fn(),
}));

const mockSignIn = signIn as jest.Mock;
const mockResend = resendSignupOtp as jest.Mock;

function makeNavigation() {
  return { navigate: jest.fn(), goBack: jest.fn() } as unknown as AuthScreenProps<'Login'>['navigation'];
}

describe('LoginScreen', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockResend.mockReset();
    useLoginNotice.setState({ notice: null });
  });

  it('asks for an email and a password only (phone sign-in is off)', async () => {
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.queryByText('Phone number')).toBeNull();
  });

  it('puts the brand on top and the title in the header role', async () => {
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByText('ZaraiLink')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Sign in' })).toBeTruthy();
  });

  it('submits email + password and calls signIn', async () => {
    mockSignIn.mockResolvedValue(undefined);
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(mockSignIn).toHaveBeenCalledWith({ email: 'farmer@example.com', password: 'secret123' });
  });

  it('trims the email before signing in (a trailing space from a paste is not an error)', async () => {
    mockSignIn.mockResolvedValue(undefined);
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), '  farmer@example.com ');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(mockSignIn).toHaveBeenCalledWith({ email: 'farmer@example.com', password: 'secret123' });
  });

  it('gives the fields autofill hints so a password manager can fill and save them (AU-04)', async () => {
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByLabelText('Email').props.autoComplete).toBe('email');
    expect(screen.getByLabelText('Password').props.autoComplete).toBe('current-password');
    expect(screen.getByLabelText('Show password')).toBeTruthy();
  });

  it('shows the submit error when signIn rejects', async () => {
    mockSignIn.mockRejectedValue(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'));
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrongpass');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Incorrect email or password.')).toBeTruthy();
    expect(screen.queryByText('Invalid login credentials')).toBeNull();
  });

  it('names a lost connection instead of a bare failure (AU-21)', async () => {
    mockSignIn.mockRejectedValue(new TypeError('Network request failed'));
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('No connection. Check your internet, then try again.')).toBeTruthy();
  });

  it('refuses a malformed email before calling Supabase', async () => {
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findAllByText('Enter a valid email')).length).toBeGreaterThan(0);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('navigates to account creation and ForgotPassword', async () => {
    const navigation = makeNavigation();
    await renderWithQuery(<LoginScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByText('Forgot password?'));
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.ForgotPassword);
    await fireEvent.press(screen.getByText('Create account'));
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.CreateAccount);
  });

  describe('an account whose email code was never entered (AU-01)', () => {
    async function signInUnconfirmed() {
      const navigation = makeNavigation();
      mockSignIn.mockRejectedValue(new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'));
      await renderWithQuery(<LoginScreen navigation={navigation} route={{} as never} />);
      await fireEvent.changeText(screen.getByLabelText('Email'), 'ali@example.com');
      await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
      await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
      return navigation;
    }

    it('offers "Enter your code", which sends a new code and opens the code screen with the email filled in', async () => {
      mockResend.mockResolvedValue(undefined);
      const navigation = await signInUnconfirmed();

      expect(await screen.findByText('Confirm your email first')).toBeTruthy();
      expect(screen.getByText('Enter the code we emailed to ali@example.com.')).toBeTruthy();
      await fireEvent.press(screen.getByText('Enter your code'));

      await waitFor(() =>
        expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.VerifyOtp, { purpose: 'signup', email: 'ali@example.com' }),
      );
      expect(mockResend).toHaveBeenCalledWith('ali@example.com');
    });

    it('still opens the code screen when the new code was refused only as too soon: the earlier code works', async () => {
      mockResend.mockRejectedValue(new AuthApiError('rate', 429, 'over_email_send_rate_limit'));
      const navigation = await signInUnconfirmed();
      await fireEvent.press(await screen.findByText('Enter your code'));
      await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.VerifyOtp, expect.anything()));
    });

    it('stays here and says so when the code could not be sent at all', async () => {
      mockResend.mockRejectedValue(new TypeError('Network request failed'));
      const navigation = await signInUnconfirmed();
      await fireEvent.press(await screen.findByText('Enter your code'));
      expect(await screen.findByText('No connection. Check your internet, then try again.')).toBeTruthy();
      expect(navigation.navigate).not.toHaveBeenCalled();
    });
  });

  it('shows what the previous screen left for sign-in and fills the email (account deleted, approved)', async () => {
    useLoginNotice.setState({
      notice: { tone: 'success', title: 'Your account is approved', message: 'Sign in with your password.', email: 'dealer@example.com' },
    });
    await renderWithQuery(<LoginScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByText('Your account is approved')).toBeTruthy();
    expect(screen.getByDisplayValue('dealer@example.com')).toBeTruthy();
  });
});
