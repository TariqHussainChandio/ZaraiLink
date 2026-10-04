import { CircleAlert } from 'lucide-react-native';
import React, { forwardRef, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { type Theme, useTheme } from '../../theme';

export interface TextFieldProps extends TextInputProps {
  /** Always visible above the box; never replaced by the placeholder. */
  label?: string;
  /** What to enter, shown under the box until there is an error. */
  helper?: string;
  /** The cause and the fix ("Enter a price per 40 kg maund"); replaces the helper and is announced. */
  error?: string;
  /** Fixed text inside the box before the value, such as "Rs". */
  prefix?: string;
  /** Fixed text inside the box after the value, such as "per 50 kg bag". */
  suffix?: string;
  /** Marks a field that can be left empty; required is the default and is not marked. */
  optional?: boolean;
  /** Sets the value in the mono face, for prices and quantities. */
  numeric?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(
  ({ label, helper, error, prefix, suffix, optional, numeric, editable = true, style, onFocus, onBlur, ...rest }, ref) => {
    const theme = useTheme();
    const styles = useMemo(() => makeStyles(theme), [theme]);
    const [focused, setFocused] = useState(false);

    return (
      <View style={styles.container}>
        {label ? (
          <View style={styles.labelRow}>
            <Text style={styles.label}>{label}</Text>
            {optional ? <Text style={styles.optional}>Optional</Text> : null}
          </View>
        ) : null}
        <View
          style={[
            styles.box,
            focused && styles.boxFocused,
            error ? styles.boxError : null,
            !editable && styles.boxDisabled,
          ]}
        >
          {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
          <TextInput
            ref={ref}
            accessibilityLabel={label}
            accessibilityHint={error ?? helper}
            editable={editable}
            placeholderTextColor={theme.colors.ink3}
            onFocus={e => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={e => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={[styles.input, numeric && styles.numeric, !editable && styles.inputDisabled, style]}
            {...rest}
          />
          {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
        </View>
        {error ? (
          <View style={styles.errorRow} accessibilityLiveRegion="polite">
            <CircleAlert color={theme.colors.status.danger.mark} size={theme.size.iconSm} />
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : helper ? (
          <Text style={styles.helper}>{helper}</Text>
        ) : null}
      </View>
    );
  },
);

TextField.displayName = 'TextField';

function makeStyles({ colors, space, borders, components, typography }: Theme) {
  return StyleSheet.create({
    container: { marginBottom: space[4], gap: space[2] },
    labelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
    label: { ...typography.label, color: colors.ink },
    optional: { ...typography.caption, color: colors.ink3 },
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: components.input.gap,
      minHeight: components.input.height,
      paddingHorizontal: components.input.paddingX,
      borderWidth: borders.control,
      borderColor: colors.lineStrong,
      borderRadius: components.input.radius,
      backgroundColor: colors.surface,
    },
    // The ring is drawn by widening the border, so the box does not move when it gains focus.
    boxFocused: { borderColor: colors.focus, borderWidth: borders.focus },
    boxError: { borderColor: colors.status.danger.mark, borderWidth: borders.focus },
    boxDisabled: { backgroundColor: colors.surfaceSunken, borderColor: colors.line },
    input: { ...typography.bodyLg, flex: 1, color: colors.ink, paddingVertical: space[3] },
    numeric: { ...typography.figure },
    inputDisabled: { color: colors.inkDisabled },
    affix: { ...typography.figure, color: colors.ink2 },
    suffix: { ...typography.caption, color: colors.ink2 },
    errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[1] },
    error: { ...typography.caption, flex: 1, color: colors.status.danger.mark },
    helper: { ...typography.caption, color: colors.ink3 },
  });
}
