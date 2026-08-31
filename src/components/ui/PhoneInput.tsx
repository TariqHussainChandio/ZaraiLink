import React from 'react';
import { Input } from './Input';

export interface PhoneInputProps {
  label?: string;
  /** Stored/emitted as E.164 (e.g. "+923001234567"), or null when empty. */
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
}

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export function PhoneInput({ label = 'Phone', value, onChange, error }: PhoneInputProps) {
  return (
    <Input
      label={label}
      keyboardType="phone-pad"
      placeholder="+923001234567"
      value={value ?? ''}
      onChangeText={text => onChange(text || null)}
      error={error}
    />
  );
}

export function isValidE164(value: string): boolean {
  return E164_PATTERN.test(value);
}
