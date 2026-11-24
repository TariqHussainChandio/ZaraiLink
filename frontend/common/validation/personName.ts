// Zod rule for a person's name: letters (English or Urdu) and single spaces only.
import { z } from 'zod';

// D20: a person's name is letters only, one space between words; no digits, no symbols. Letters are English (A–Z) and
// the Arabic-script letters Urdu is written in (U+0621–U+064A and U+0671–U+06D3, which leave out the Arabic-Indic and
// Urdu digits and the Urdu punctuation), so "Muhammad Ali" and "محمد علی" are both names. The ranges are written out
// rather than as `\p{L}`, which Hermes does not support in every version this app may run on.
const LETTERS = 'A-Za-zء-يٱ-ۓ';
const LETTERS_AND_SPACES = new RegExp(`^[${LETTERS} ]*$`);
const NAME_MAX_LENGTH = 120;

/** Shown under a name field the moment a digit or a symbol is typed. */
export const NAME_CHARACTERS_MESSAGE = 'Numbers and special characters are not allowed';

/** A person's full name: sign-up and Edit profile. The database keeps at most 120 characters (handle_new_user). */
export const personNameSchema = z
  .string()
  .refine(value => LETTERS_AND_SPACES.test(value), NAME_CHARACTERS_MESSAGE)
  .refine(value => !value.includes('  '), 'Use a single space between names')
  .refine(value => value.trim().length >= 2, 'Enter your full name')
  .refine(value => value.trim().length <= NAME_MAX_LENGTH, `Use at most ${NAME_MAX_LENGTH} characters`);
