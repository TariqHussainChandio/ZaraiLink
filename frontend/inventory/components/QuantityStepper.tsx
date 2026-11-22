import { Minus, Plus } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { TextField } from '../../common/components';
import { type Accent, type Theme, useRoleAccent, useTheme } from '../../theme';

export interface QuantityStepperProps {
  label: string;
  /** The typed text, so a half-typed "2." is kept as the dealer types it. */
  value: string;
  onChange: (value: string) => void;
  unit?: string;
  error?: string;
  /** How much one press of − or + changes the quantity. */
  step?: number;
}

function parse(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/** A quantity field with large − and + buttons either side (48 dp targets), for counting stock on a shop floor. The
 * field stays editable for a large or fractional amount; − never goes below zero. */
export function QuantityStepper({ label, value, onChange, unit, error, step = 1 }: QuantityStepperProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const current = parse(value);

  const change = (delta: number) => onChange(String(Math.max(0, Math.round((current + delta) * 100) / 100)));

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => change(-step)}
        disabled={current <= 0}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label.toLowerCase()}`}
        accessibilityState={{ disabled: current <= 0 }}
        style={[styles.button, current <= 0 && styles.disabled]}
      >
        <Minus color={accent.ink} size={theme.size.iconMd} />
      </Pressable>
      <View style={styles.field}>
        <TextField
          label={label}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          numeric
          suffix={unit}
          error={error}
        />
      </View>
      <Pressable
        onPress={() => change(step)}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label.toLowerCase()}`}
        style={styles.button}
      >
        <Plus color={accent.ink} size={theme.size.iconMd} />
      </Pressable>
    </View>
  );
}

function makeStyles({ space, size, radius, borders }: Theme, accent: Accent) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
    field: { flex: 1 },
    // Lined up with the input box, below the field's label.
    button: {
      width: size.input,
      height: size.input,
      marginTop: space[6],
      borderRadius: radius.md,
      borderWidth: borders.control,
      borderColor: accent.mark,
      backgroundColor: accent.soft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabled: { opacity: 0.4 },
  });
}
