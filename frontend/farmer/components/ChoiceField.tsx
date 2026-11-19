import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChipRow, type ChipOption } from '../../common/components';
import { type Theme, useTheme } from '../../theme';

interface ChoiceFieldProps {
  label: string;
  options: ChipOption<string>[];
  value: string;
  onChange: (value: string) => void;
  /** Marks a choice that can be left empty; required is the default and is not marked. */
  optional?: boolean;
  /** Under the chips, until there is an error. */
  helper?: string;
  error?: string;
}

/** A label above wrapping chips, in the same label style as TextField and SelectField, for a short fixed list (a unit, a
 * growth stage) that a person should see whole instead of opening a list. */
export function ChoiceField({ label, options, value, onChange, optional, helper, error }: ChoiceFieldProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {optional ? <Text style={styles.optional}>Optional</Text> : null}
      </View>
      <ChipRow options={options} value={value} onChange={onChange} wrap />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    container: { gap: space[2] },
    labelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
    label: { ...typography.label, color: colors.ink },
    optional: { ...typography.caption, color: colors.ink3 },
    error: { ...typography.caption, color: colors.status.danger.mark },
    helper: { ...typography.caption, color: colors.ink3 },
  });
}
