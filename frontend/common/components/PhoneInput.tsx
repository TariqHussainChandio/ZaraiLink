import { parsePhoneNumberFromString, validatePhoneNumberLength } from 'libphonenumber-js';
import React, { useState } from 'react';
import { TextField } from './TextField';

export interface PhoneInputProps {
  label?: string;
  /** Stored/emitted as E.164 (e.g. "+923001234567"), or null when empty. While what is typed is not yet a number, the
   * typed text is emitted as it is, so the form's own validation fails on it rather than on an empty field. */
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
}

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;
const DEFAULT_COUNTRY = 'PK';
/** What a phone number is typed with: digits, a leading + for the country code, and the spaces, dashes and brackets
 * people group digits with. */
const PHONE_CHARACTERS = /^[+\d\s()-]*$/;
/** E.164 allows 15 digits; with a + and grouping, no real number needs more characters than this. */
const PHONE_MAX_CHARACTERS = 20;

const digitCount = (text: string) => text.replace(/\D/g, '').length;
const isValidNumber = (text: string) => parsePhoneNumberFromString(text, DEFAULT_COUNTRY)?.isValid() === true;

/** E.164 for a number a person typed the way they say it ("0300 1234567", "+92 300 1234567", "923001234567"), or the
 * trimmed text when it is not a valid number, or null when empty. A number with another country's code stays that
 * country's: the default country only decides how a number with no code is read. */
function toValue(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_COUNTRY);
  return parsed?.isValid() ? parsed.number : trimmed;
}

/** A phone number, read as Pakistani unless it starts with another country's code (+44, +971, ...). The value out is
 * E.164. Letters, symbols and digits past the country's longest number are refused as they are typed (D20). */
export function PhoneInput({ label = 'Phone', value, onChange, error }: PhoneInputProps) {
  const [text, setText] = useState(value ?? '');
  // The value last sent up (or received). A different value coming down means the form was reset or loaded, so the box
  // shows it; the value this component just sent up must not overwrite what is being typed ("0300 1234567" would turn
  // into "+923001234567" under the person's thumbs).
  const [synced, setSynced] = useState<string | null>(value);
  const [touched, setTouched] = useState(false);
  // D20: a keystroke the number cannot take is refused as it is typed, with the reason under the box.
  const [refused, setRefused] = useState<string | null>(null);
  if (value !== synced) {
    setSynced(value);
    setText(value ?? '');
  }

  const invalid = text.trim() !== '' && !isValidE164(toValue(text) ?? '');

  return (
    <TextField
      label={label}
      keyboardType="phone-pad"
      autoComplete="tel"
      textContentType="telephoneNumber"
      placeholder="0300 1234567"
      helper="For example 0300 1234567"
      value={text}
      maxLength={PHONE_MAX_CHARACTERS}
      onChangeText={next => {
        if (!PHONE_CHARACTERS.test(next)) {
          setRefused('Use digits only, with + before a country code');
          return;
        }
        // The longest number the country allows (libphonenumber's metadata, the same for +44 or +971 as for Pakistan):
        // one digit more is refused rather than accepted and failed later.
        if (validatePhoneNumberLength(next, DEFAULT_COUNTRY) === 'TOO_LONG') {
          setRefused('That is more digits than a phone number has');
          return;
        }
        // A number that is already complete and valid takes no further digit that would make it invalid
        // ("0300 1234567" stops at its 11th digit); where the country has longer numbers too, the digit is taken.
        if (digitCount(next) > digitCount(text) && isValidNumber(text) && !isValidNumber(next)) {
          setRefused('That number is complete');
          return;
        }
        setRefused(null);
        const out = toValue(next);
        setText(next);
        setSynced(out);
        onChange(out);
      }}
      onBlur={() => setTouched(true)}
      error={refused ?? error ?? (touched && invalid ? 'Enter a phone number like 0300 1234567' : undefined)}
    />
  );
}

/** A complete E.164 number: the shape, and a number that exists in its country (a short "+92 300" fits the shape only). */
export function isValidE164(value: string): boolean {
  return E164_PATTERN.test(value) && parsePhoneNumberFromString(value)?.isValid() === true;
}
