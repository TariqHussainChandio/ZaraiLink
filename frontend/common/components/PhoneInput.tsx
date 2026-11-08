import { parsePhoneNumberFromString } from 'libphonenumber-js';
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

/** E.164 for a number a person typed the way they say it ("0300 1234567", "+92 300 1234567", "923001234567"), or the
 * trimmed text when it is not a valid number, or null when empty. A number with another country's code stays that
 * country's: the default country only decides how a number with no code is read. */
function toValue(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_COUNTRY);
  return parsed?.isValid() ? parsed.number : trimmed;
}

/** A phone number, read as Pakistani unless it starts with another country's code. The value out is E.164. */
export function PhoneInput({ label = 'Phone', value, onChange, error }: PhoneInputProps) {
  const [text, setText] = useState(value ?? '');
  // The value last sent up (or received). A different value coming down means the form was reset or loaded, so the box
  // shows it; the value this component just sent up must not overwrite what is being typed ("0300 1234567" would turn
  // into "+923001234567" under the person's thumbs).
  const [synced, setSynced] = useState<string | null>(value);
  const [touched, setTouched] = useState(false);
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
      onChangeText={next => {
        const out = toValue(next);
        setText(next);
        setSynced(out);
        onChange(out);
      }}
      onBlur={() => setTouched(true)}
      error={error ?? (touched && invalid ? 'Enter a phone number like 0300 1234567' : undefined)}
    />
  );
}

/** A complete E.164 number: the shape, and a number that exists in its country (a short "+92 300" fits the shape only). */
export function isValidE164(value: string): boolean {
  return E164_PATTERN.test(value) && parsePhoneNumberFromString(value)?.isValid() === true;
}
