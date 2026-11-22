import { z } from 'zod';

// The one password rule (D15 AU findings): it matches what Supabase Auth enforces (supabase/config.toml,
// `minimum_password_length = 8`, `password_requirements = "letters_digits"`), so a password the form accepts is never
// refused by the server afterwards, and every screen that sets a password says the same thing.
const PASSWORD_MIN_LENGTH = 8;

/** Shown under a new-password field before anything is typed, and as the error when the rule is not met. */
export const PASSWORD_HELPER = `Use at least ${PASSWORD_MIN_LENGTH} characters, with letters and numbers`;

/** A new password: sign-up, reset and change. Signing in only checks that something was typed. */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, PASSWORD_HELPER)
  .regex(/[A-Za-z]/, PASSWORD_HELPER)
  .regex(/\d/, PASSWORD_HELPER);
