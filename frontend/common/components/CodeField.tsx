import React, { forwardRef, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { type Theme, useTheme } from '../../theme';

export interface CodeFieldProps {
  /** The code as digits only, at most `length` of them. */
  value: string;
  onChange: (value: string) => void;
  /** How many digits the code has (6 for the email and sign-in codes). */
  length?: number;
  label?: string;
  /** The cause and the fix ("That code is not right. Check it, or ask for a new one."). */
  error?: string;
  /** Called once the last digit is in, so a screen can submit without a button press. */
  onComplete?: (value: string) => void;
}

/** A one-time code: ONE text input, shown as `length` cells. A password manager or the keyboard's code suggestion fills it
 * (`one-time-code` autofill), and a pasted "Your code is 123456" works.
 *
 * It sets no `maxLength` on purpose. Android applies `maxLength` before any filter, so a pasted sentence would be cut to
 * its first six characters, "Your c", and then filtered down to nothing. The digits are taken out of whatever arrives and
 * the count is capped here instead. */
export const CodeField = forwardRef<TextInput, CodeFieldProps>(({ value, onChange, length = 6, label = 'Code', error, onComplete }, ref) => {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [focused, setFocused] = useState(false);
  const cells = Array.from({ length }, (_, i) => value[i] ?? '');
  const current = Math.min(value.length, length - 1);

  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View>
        {/* The cells are a picture of the input, not something to read out: TalkBack gets the one input below. */}
        <View style={styles.cells} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {cells.map((digit, i) => (
            <View
              // Positions are fixed and never reorder.
              key={i}
              style={[styles.cell, focused && i === current && styles.cellActive, error ? styles.cellError : null]}
            >
              <Text style={styles.digit}>{digit}</Text>
            </View>
          ))}
        </View>
        {/* The one real input lies over the cells, invisible, so a tap anywhere on them focuses it. */}
        <TextInput
          ref={ref}
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          importantForAutofill="yes"
          caretHidden
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          accessibilityHint={error ?? `Enter the ${length} digit code`}
        />
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

CodeField.displayName = 'CodeField';

function makeStyles({ colors, space, size, borders, radius, typography }: Theme) {
  return StyleSheet.create({
    container: { gap: space[2], marginBottom: space[4] },
    label: { ...typography.label, color: colors.ink },
    cells: { flexDirection: 'row', gap: space[2] },
    cell: {
      flex: 1,
      minHeight: size.input,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: borders.control,
      borderColor: colors.lineStrong,
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
    },
    cellActive: { borderColor: colors.focus, borderWidth: borders.focus },
    cellError: { borderColor: colors.status.danger.mark, borderWidth: borders.focus },
    digit: { ...typography.headline, color: colors.ink },
    // Invisible but present: it keeps its full size so it receives the tap, the autofill and the paste.
    input: { ...StyleSheet.absoluteFill, opacity: 0, color: colors.ink },
    error: { ...typography.caption, color: colors.status.danger.mark },
  });
}
