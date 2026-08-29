import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { lightTheme } from '../../theme';
import { useReferenceDataStore } from '../../store/referenceDataStore';
import { SelectField } from './SelectField';

export interface PhoneInputProps {
  label?: string;
  /** Stored/emitted as E.164 (e.g. "+923001234567"), or null when empty. */
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
}

const { colors, spacing, radii, typography } = lightTheme;

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

function digitsOnly(input: string): string {
  return input.replace(/\D/g, '');
}

export function PhoneInput({ label = 'Phone', value, onChange, error }: PhoneInputProps) {
  const countries = useReferenceDataStore(state => state.countries);
  const phoneCodes = useReferenceDataStore(state => state.phoneCodes);
  const loadCountries = useReferenceDataStore(state => state.loadCountries);
  const loadPhoneCodes = useReferenceDataStore(state => state.loadPhoneCodes);

  useEffect(() => {
    loadCountries();
    loadPhoneCodes();
  }, [loadCountries, loadPhoneCodes]);

  const codeOptions = useMemo(
    () =>
      phoneCodes.map(code => {
        const country = countries.find(c => c.id === code.country_id);
        return { id: code.id, label: `${country?.name ?? code.calling_code} (${code.calling_code})` };
      }),
    [phoneCodes, countries],
  );

  // Best-effort split of an existing E.164 value into calling code + local number, so editing
  // an already-saved phone number doesn't blank the fields out.
  const initialMatch = useMemo(() => {
    if (!value) return null;
    const match = phoneCodes.find(code => value.startsWith(code.calling_code));
    return match ? { codeId: match.id, local: value.slice(match.calling_code.length) } : null;
  }, [value, phoneCodes]);

  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(initialMatch?.codeId ?? null);
  const [localNumber, setLocalNumber] = useState(initialMatch?.local ?? '');

  useEffect(() => {
    if (!selectedCodeId && phoneCodes.length === 1) {
      setSelectedCodeId(phoneCodes[0].id);
    }
  }, [phoneCodes, selectedCodeId]);

  const emit = (codeId: string | null, local: string) => {
    const code = phoneCodes.find(c => c.id === codeId);
    const digits = digitsOnly(local);
    if (!code || !digits) {
      onChange(null);
      return;
    }
    onChange(`${code.calling_code}${digits}`);
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <View style={styles.codeField}>
          <SelectField
            value={selectedCodeId}
            options={codeOptions}
            placeholder="Code"
            searchable={false}
            onSelect={id => {
              setSelectedCodeId(id);
              emit(id, localNumber);
            }}
          />
        </View>
        <TextInput
          style={styles.input}
          keyboardType="phone-pad"
          placeholder="300 1234567"
          placeholderTextColor={colors.neutral.gray400}
          value={localNumber}
          onChangeText={text => {
            setLocalNumber(text);
            emit(selectedCodeId, text);
          }}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function isValidE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium as any,
    color: colors.neutral.gray700,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  codeField: {
    width: 140,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.neutral.gray300,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.sizes.base,
    color: colors.neutral.gray900,
    backgroundColor: colors.neutral.white,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.xs,
    color: colors.semantic.error,
  },
});
