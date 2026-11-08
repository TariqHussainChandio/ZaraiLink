import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { AuthApiError } from '@supabase/supabase-js';
import { RegisterScreen } from './RegisterScreen';
import { signUp } from '../services/authService';
import { AUTH_ROUTES } from '../../constants/routes';
import { PASSWORD_HELPER } from '../../validation/password';
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

const createAccount = () => screen.getByRole('button', { name: 'Create account' });

async function fillAccount(phone = '03001234567') {
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Farmer Test');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'farmer@example.com');
  await fireEvent.changeText(screen.getByLabelText('Phone'), phone);
  await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
}

async function chooseProvince(name: string) {
  await fireEvent.press(screen.getByRole('button', { name: /^Province/ }));
  await fireEvent.press(await screen.findByText(name));
}

async function fillLocation({ village = true } = {}) {
  await chooseProvince('Sindh');
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
    await fireEvent.press(createAccount());

    // The phone is typed the way people say it and stored as E.164; the country is never asked, and is always Pakistan.
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

  it('has no Country field, and the province is chosen from a list (AU-17)', async () => {
    await renderAs('farmer');
    expect(screen.queryByLabelText('Country')).toBeNull();
    expect(screen.getByRole('button', { name: /^Province/ })).toBeTruthy();
  });

  it('asks a buyer for location but no village', async () => {
    mockSignUp.mockResolvedValue({ session: null });
    await renderAs('buyer');
    expect(screen.queryByLabelText('Village')).toBeNull();
    await fillAccount();
    await fillLocation({ village: false });
    await fireEvent.press(createAccount());
    expect(mockSignUp).toHaveBeenCalledWith(expect.objectContaining({ role: 'buyer', city: 'Hyderabad' }));
    expect(mockSignUp.mock.calls[0][0]).not.toHaveProperty('village');
  });

  it('refuses a farmer without a village or location, and says what is wrong above the button', async () => {
    await renderAs('farmer');
    await fillAccount();
    await fireEvent.press(createAccount());
    expect((await screen.findAllByText('Enter your village')).length).toBeGreaterThan(0);
    expect(screen.getByText('Choose your province')).toBeTruthy();
    expect(screen.getByText('Enter your city')).toBeTruthy();
    expect(screen.getByText(/Fix these \d+ things to continue/)).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('asks a dealer only for the account, and says the application and review come next', async () => {
    mockSignUp.mockResolvedValue({ session: null });
    await renderAs('dealer');
    expect(screen.getByText(/you send your business details/)).toBeTruthy();
    expect(screen.queryByLabelText('City')).toBeNull();
    await fillAccount();
    await fireEvent.press(createAccount());
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'farmer@example.com',
      password: 'secret123',
      fullName: 'Farmer Test',
      role: 'dealer',
      phone: '+923001234567',
    });
  });

  it.each(['0300 1234567', '0300-1234567', '+92 300 1234567'])('accepts the number written %s and sends it as +923001234567', async typed => {
    mockSignUp.mockResolvedValue({ session: null });
    await renderAs('dealer');
    await fillAccount(typed);
    await fireEvent.press(createAccount());
    expect(mockSignUp).toHaveBeenCalledWith(expect.objectContaining({ phone: '+923001234567' }));
  });

  it('refuses a phone number that is not a number', async () => {
    await renderAs('expert');
    await fillAccount('0300');
    await fireEvent.press(createAccount());
    expect((await screen.findAllByText('Enter a phone number like 0300 1234567')).length).toBeGreaterThan(0);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('does not navigate to VerifyOtp when signUp already returns a session', async () => {
    mockSignUp.mockResolvedValue({ session: { access_token: 'x' } });
    const navigation = makeNavigation();
    await renderAs('expert', navigation);
    await fillAccount();
    await fireEvent.press(createAccount());
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('shows the submit error when signUp rejects', async () => {
    mockSignUp.mockRejectedValue(new AuthApiError('User already registered', 422, 'user_already_exists'));
    await renderAs('dealer');
    await fillAccount();
    await fireEvent.press(createAccount());
    expect(await screen.findByText('An account with these details already exists. Try signing in.')).toBeTruthy();
    expect(screen.queryByText('User already registered')).toBeNull();
  });

  it.each(['abc12', 'abcdefgh', '12345678'])(
    'refuses %s before calling Supabase: at least 8 characters, with letters and numbers',
    async password => {
      await renderAs('dealer');
      await fillAccount();
      await fireEvent.changeText(screen.getByLabelText('Password'), password);
      await fireEvent.press(createAccount());
      expect((await screen.findAllByText(PASSWORD_HELPER)).length).toBeGreaterThan(0);
      expect(mockSignUp).not.toHaveBeenCalled();
    },
  );

  it('trims the email, hints the password manager, and lets the password be shown (AU-04)', async () => {
    mockSignUp.mockResolvedValue({ session: null });
    await renderAs('dealer');
    expect(screen.getByLabelText('Password').props.autoComplete).toBe('new-password');
    expect(screen.getByLabelText('Email').props.autoComplete).toBe('email');
    expect(screen.getByLabelText('Show password')).toBeTruthy();
    await fillAccount();
    await fireEvent.changeText(screen.getByLabelText('Email'), ' farmer@example.com ');
    await fireEvent.press(createAccount());
    expect(mockSignUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'farmer@example.com' }));
  });

  it('goes back to the choice of account type, and to Login', async () => {
    const navigation = makeNavigation();
    await renderAs('buyer', navigation);
    await fireEvent.press(screen.getByText('Choose a different account type'));
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.CreateAccount);
    await fireEvent.press(screen.getByText('Sign in'));
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.Login);
  });
});
