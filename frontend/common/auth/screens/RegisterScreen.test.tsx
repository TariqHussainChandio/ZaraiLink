import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { AuthApiError } from '@supabase/supabase-js';
import { RegisterScreen } from './RegisterScreen';
import { signUp } from '../services/authService';
import { AUTH_ROUTES } from '../../constants/routes';
import { ROLE_LABELS } from '../../constants/roles';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

jest.mock('../services/authService', () => ({
  signUp: jest.fn(),
}));

const mockSignUp = signUp as jest.Mock;

function makeNavigation() {
  return { navigate: jest.fn(), goBack: jest.fn() } as unknown as AuthScreenProps<'Register'>['navigation'];
}

async function fillRequiredFields() {
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Farmer Test');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
  await fireEvent.press(screen.getByText(ROLE_LABELS.farmer));
}

describe('RegisterScreen', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
  });

  it('renders the registrable roles, excluding admin', async () => {
    await renderWithQuery(<RegisterScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByText(ROLE_LABELS.farmer)).toBeTruthy();
    expect(screen.getByText(ROLE_LABELS.buyer)).toBeTruthy();
    expect(screen.getByText(ROLE_LABELS.dealer)).toBeTruthy();
    expect(screen.getByText(ROLE_LABELS.expert)).toBeTruthy();
    expect(screen.queryByText(ROLE_LABELS.admin)).toBeNull();
  });

  it('submits the form and navigates to VerifyOtp when no session is returned', async () => {
    mockSignUp.mockResolvedValue({ session: null });
    const navigation = makeNavigation();
    await renderWithQuery(<RegisterScreen navigation={navigation} route={{} as never} />);
    await fillRequiredFields();
    await fireEvent.press(screen.getByText('Create account'));

    expect(mockSignUp).toHaveBeenCalledWith({
      channel: 'email',
      identifier: 'farmer@example.com',
      password: 'secret123',
      fullName: 'Farmer Test',
      role: 'farmer',
    });
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.VerifyOtp, {
      purpose: 'signup',
      channel: 'email',
      identifier: 'farmer@example.com',
    });
  });

  it('does not navigate to VerifyOtp when signUp already returns a session', async () => {
    mockSignUp.mockResolvedValue({ session: { access_token: 'x' } });
    const navigation = makeNavigation();
    await renderWithQuery(<RegisterScreen navigation={navigation} route={{} as never} />);
    await fillRequiredFields();
    await fireEvent.press(screen.getByText('Create account'));

    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('shows the submit error when signUp rejects', async () => {
    mockSignUp.mockRejectedValue(new AuthApiError('User already registered', 422, 'user_already_exists'));
    await renderWithQuery(<RegisterScreen navigation={makeNavigation()} route={{} as never} />);
    await fillRequiredFields();
    await fireEvent.press(screen.getByText('Create account'));

    expect(await screen.findByText('An account with these details already exists. Try signing in.')).toBeTruthy();
    expect(screen.queryByText('User already registered')).toBeNull();
  });

  it('navigates to Login', async () => {
    const navigation = makeNavigation();
    await renderWithQuery(<RegisterScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByText(' Sign in'));
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.Login);
  });
});
