jest.mock('../../../services/supabase/client', () => {
  const { makeSupabaseMock } = jest.requireActual('../../../testUtils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

import { supabase } from '../../../services/supabase/client';
import { makeSupabaseMock } from '../../../testUtils/supabaseMock';
import {
  resendRecoveryOtp,
  resendSignupOtp,
  resetPassword,
  signIn,
  signOut,
  signUp,
  verifyRecoveryOtp,
  verifySignupOtp,
} from './authService';

const mockedSupabase = supabase as unknown as ReturnType<typeof makeSupabaseMock>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('signUp', () => {
  it('sends email + password + full_name/role metadata for the email channel', async () => {
    mockedSupabase.auth.signUp.mockResolvedValue({ data: { session: null, user: null }, error: null } as never);

    await signUp({ channel: 'email', identifier: 'farmer@example.com', password: 'secret123', fullName: 'Farmer Test', role: 'farmer' });

    expect(mockedSupabase.auth.signUp).toHaveBeenCalledWith({
      email: 'farmer@example.com',
      password: 'secret123',
      options: { data: { full_name: 'Farmer Test', role: 'farmer' } },
    });
  });

  it('sends phone instead of email for the phone channel', async () => {
    mockedSupabase.auth.signUp.mockResolvedValue({ data: { session: null, user: null }, error: null } as never);

    await signUp({ channel: 'phone', identifier: '+923001234567', password: 'secret123', fullName: 'Farmer Test', role: 'buyer' });

    expect(mockedSupabase.auth.signUp).toHaveBeenCalledWith({
      phone: '+923001234567',
      password: 'secret123',
      options: { data: { full_name: 'Farmer Test', role: 'buyer' } },
    });
  });

  it('throws the Supabase error instead of swallowing it', async () => {
    const error = new Error('Email already registered');
    mockedSupabase.auth.signUp.mockResolvedValue({ data: { session: null, user: null }, error } as never);

    await expect(
      signUp({ channel: 'email', identifier: 'dup@example.com', password: 'secret123', fullName: 'Dup', role: 'buyer' }),
    ).rejects.toThrow('Email already registered');
  });
});

describe('signIn', () => {
  it('signs in with email + password for the email channel', async () => {
    mockedSupabase.auth.signInWithPassword.mockResolvedValue({ data: { session: {}, user: {} }, error: null } as never);
    await signIn({ channel: 'email', identifier: 'farmer@example.com', password: 'secret123' });
    expect(mockedSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'farmer@example.com',
      password: 'secret123',
    });
  });

  it('signs in with phone + password for the phone channel', async () => {
    mockedSupabase.auth.signInWithPassword.mockResolvedValue({ data: { session: {}, user: {} }, error: null } as never);
    await signIn({ channel: 'phone', identifier: '+923001234567', password: 'secret123' });
    expect(mockedSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      phone: '+923001234567',
      password: 'secret123',
    });
  });

  it('throws on invalid credentials', async () => {
    mockedSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: new Error('Invalid login credentials'),
    } as never);

    await expect(signIn({ channel: 'email', identifier: 'x@example.com', password: 'wrong' })).rejects.toThrow(
      'Invalid login credentials',
    );
  });
});

describe('signOut', () => {
  it('calls supabase signOut', async () => {
    mockedSupabase.auth.signOut.mockResolvedValue({ error: null });
    await signOut();
    expect(mockedSupabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('throws on error', async () => {
    mockedSupabase.auth.signOut.mockResolvedValue({ error: new Error('network down') } as never);
    await expect(signOut()).rejects.toThrow('network down');
  });
});

describe('verifySignupOtp', () => {
  it('verifies a signup-type OTP for email', async () => {
    mockedSupabase.auth.verifyOtp.mockResolvedValue({ data: { session: {}, user: {} }, error: null } as never);
    await verifySignupOtp('email', 'farmer@example.com', '123456');
    expect(mockedSupabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'farmer@example.com',
      token: '123456',
      type: 'signup',
    });
  });

  it('verifies an sms-type OTP for phone', async () => {
    mockedSupabase.auth.verifyOtp.mockResolvedValue({ data: { session: {}, user: {} }, error: null } as never);
    await verifySignupOtp('phone', '+923001234567', '654321');
    expect(mockedSupabase.auth.verifyOtp).toHaveBeenCalledWith({
      phone: '+923001234567',
      token: '654321',
      type: 'sms',
    });
  });

  it('throws on an invalid or expired code', async () => {
    mockedSupabase.auth.verifyOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: new Error('Token has expired'),
    } as never);
    await expect(verifySignupOtp('email', 'x@example.com', '000000')).rejects.toThrow('Token has expired');
  });
});

describe('resendSignupOtp', () => {
  it('resends a signup email OTP', async () => {
    mockedSupabase.auth.resend.mockResolvedValue({ data: {}, error: null });
    await resendSignupOtp('email', 'farmer@example.com');
    expect(mockedSupabase.auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'farmer@example.com' });
  });

  it('resends an sms OTP', async () => {
    mockedSupabase.auth.resend.mockResolvedValue({ data: {}, error: null });
    await resendSignupOtp('phone', '+923001234567');
    expect(mockedSupabase.auth.resend).toHaveBeenCalledWith({ type: 'sms', phone: '+923001234567' });
  });
});

describe('resetPassword', () => {
  it('requests a reset email with no redirectTo (P4: a numeric code, not a link)', async () => {
    mockedSupabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await resetPassword('farmer@example.com');
    expect(mockedSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('farmer@example.com');
  });

  it('throws on error', async () => {
    mockedSupabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: new Error('no such user') } as never);
    await expect(resetPassword('missing@example.com')).rejects.toThrow('no such user');
  });
});

describe('verifyRecoveryOtp', () => {
  it('verifies a recovery-type code', async () => {
    mockedSupabase.auth.verifyOtp.mockResolvedValue({ data: { session: {}, user: {} }, error: null } as never);
    await verifyRecoveryOtp('farmer@example.com', '654321');
    expect(mockedSupabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'farmer@example.com',
      token: '654321',
      type: 'recovery',
    });
  });

  it('throws on error', async () => {
    mockedSupabase.auth.verifyOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: new Error('invalid code'),
    } as never);
    await expect(verifyRecoveryOtp('farmer@example.com', '000000')).rejects.toThrow('invalid code');
  });
});

describe('resendRecoveryOtp', () => {
  it('requests the reset email again, the same as resetPassword (no "resend" type exists for recovery)', async () => {
    mockedSupabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await resendRecoveryOtp('farmer@example.com');
    expect(mockedSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('farmer@example.com');
  });
});
