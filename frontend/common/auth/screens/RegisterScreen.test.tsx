import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { AuthApiError } from '@supabase/supabase-js';
import { RegisterScreen } from './RegisterScreen';
import { signUp } from '../services/authService';
import { AUTH_ROUTES } from '../../constants/routes';
import type { RegistrableRole } from '../../constants/roles';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

jest.mock('../services/authService', () => ({
  signUp: jest.fn(),
}));

const mockSignUp = signUp as jest.Mock;

function makeNavigation() {
  return { navigate: jest.fn(), goBack: jest.fn() } as unknown as AuthScreenProps<'Register'>['navigation'];
}

function renderAs(role: RegistrableRole, navigation = makeNavigation()) {
  return renderWithQuery(<RegisterScreen navigation={navigation} route={{ key: 'r', name: AUTH_ROUTES.Register, params: { role } }} />);
}

async function fillAccount() {
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Farmer Test');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
  await fireEvent.changeText(screen.getByLabelText('Phone'), '+923001234567');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
}

async function fillLocation({ village = true } = {}) {
  await fireEvent.changeText(screen.getByLabelText('Country'), 'Pakistan');
  await fireEvent.changeText(screen.getByLabelText('Province'), 'Sindh');
  await fireEvent.changeText(screen.getByLabelText('City'), 'Hyderabad');
  await fireEvent.changeText(screen.getByLabelText('Address'), 'House 4, Main Road');
  if (village) await fireEvent.changeText(screen.getByLabelText('Village'), 'Goth Ali');
}

describe('RegisterScreen (A3b: one form per role, SRDS §5–§7, §10)', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
  });

  it('asks a farmer for location and village, and sends them for the profile', async () => {
    mockSignUp.mockResolvedValue({ session: null });
    const navigation = makeNavigation();
    await renderAs('farmer', navigation);
    expect(screen.getByText('Create a farmer account')).toBeTruthy();
    await fillAccount();
    await fillLocation();
    await fireEvent.press(screen.getByText('Create account'));

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'farmer@example.com',
      password: 'secret123',
      fullName: 'Farmer Test',
      role: 'farmer',
      phone: '+923001234567',
      country: 'Pakistan',
      province: 'Sindh',
      city: 'Hyderabad',
      street: 'House 4, Main Road',
      village: 'Goth Ali',
    });
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.VerifyOtp, { purpose: 'signup', email: 'farmer@example.com' });
  });

  it('asks a buyer for location but no village', async () => {
    mockSignUp.mockResolvedValue({ session: null });
    await renderAs('buyer');
    expect(screen.queryByLabelText('Village')).toBeNull();
    await fillAccount();
    await fillLocation({ village: false });
    await fireEvent.press(screen.getByText('Create account'));
    expect(mockSignUp).toHaveBeenCalledWith(expect.objectContaining({ role: 'buyer', city: 'Hyderabad' }));
    expect(mockSignUp.mock.calls[0][0]).not.toHaveProperty('village');
  });

  it('refuses a farmer without a village or location', async () => {
    await renderAs('farmer');
    await fillAccount();
    await fireEvent.press(screen.getByText('Create account'));
    expect(await screen.findByText('Enter your village')).toBeTruthy();
    expect(screen.getByText('Enter your country, province and city')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('asks a dealer only for the account, and says the application and review come next', async () => {
    mockSignUp.mockResolvedValue({ session: null });
    await renderAs('dealer');
    expect(screen.getByText(/you will send your business details/)).toBeTruthy();
    expect(screen.queryByLabelText('Country')).toBeNull();
    await fillAccount();
    await fireEvent.press(screen.getByText('Create account'));
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'farmer@example.com',
      password: 'secret123',
      fullName: 'Farmer Test',
      role: 'dealer',
      phone: '+923001234567',
    });
  });

  it('refuses a phone number without the country code', async () => {
    await renderAs('expert');
    await fillAccount();
    await fireEvent.changeText(screen.getByLabelText('Phone'), '03001234567');
    await fireEvent.press(screen.getByText('Create account'));
    expect(await screen.findByText(/with the country code/)).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('does not navigate to VerifyOtp when signUp already returns a session', async () => {
    mockSignUp.mockResolvedValue({ session: { access_token: 'x' } });
    const navigation = makeNavigation();
    await renderAs('expert', navigation);
    await fillAccount();
    await fireEvent.press(screen.getByText('Create account'));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('shows the submit error when signUp rejects', async () => {
    mockSignUp.mockRejectedValue(new AuthApiError('User already registered', 422, 'user_already_exists'));
    await renderAs('dealer');
    await fillAccount();
    await fireEvent.press(screen.getByText('Create account'));
    expect(await screen.findByText('An account with these details already exists. Try signing in.')).toBeTruthy();
    expect(screen.queryByText('User already registered')).toBeNull();
  });

  it.each(['abc12', 'abcdefgh', '12345678'])(
    'refuses %s before calling Supabase: at least 8 characters, with letters and numbers',
    async password => {
      await renderAs('dealer');
      await fillAccount();
      await fireEvent.changeText(screen.getByLabelText('Password'), password);
      await fireEvent.press(screen.getByText('Create account'));
      expect(await screen.findByText('Use at least 8 characters, with letters and numbers')).toBeTruthy();
      expect(mockSignUp).not.toHaveBeenCalled();
    },
  );

  it('goes back to the choice of account type, and to Login', async () => {
    const navigation = makeNavigation();
    await renderAs('buyer', navigation);
    await fireEvent.press(screen.getByText('Choose a different account type'));
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.CreateAccount);
    await fireEvent.press(screen.getByText(' Sign in'));
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.Login);
  });
});
