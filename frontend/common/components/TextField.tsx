// Labelled text input with helper text, error, prefix/suffix and a password eye toggle.
import { CircleAlert, Eye, EyeOff } from 'lucide-react-native';
import React, { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { type Theme, useTheme } from '../../theme';
import { IconButton } from './TopAppBar';

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
  /** Sets the value in the board face with tabular figures, for prices and quantities. */
  numeric?: boolean;
}

/** A labelled input: the label stays above the box, the helper or error below. Autofill hints (`autoComplete`,
 * `textContentType`) and the ref pass straight to the input, so a password manager and react-hook-form's focus work. A
 * `secureTextEntry` field gets a Show/Hide toggle. */
export const TextField = forwardRef<TextInput, TextFieldProps>(
  ({ label, helper, error, prefix, suffix, optional, numeric, editable = true, secureTextEntry, style, onFocus, onBlur, ...rest }, ref) => {
    const theme = useTheme();
    const styles = useMemo(() => makeStyles(theme), [theme]);
    const [focused, setFocused] = useState(false);
    // The box holds the input; a tap anywhere in it (its border, the prefix, the suffix) focuses the input, so the whole
    // 52 dp box is the target, not only the text line inside it (A8 accessibility run).
    const inputRef = useRef<TextInput | null>(null);
    // Passes the input to both the local ref and the caller's ref.
    const setRefs = useCallback(
      (node: TextInput | null) => {
        inputRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );
    const [revealed, setRevealed] = useState(false);

    return (
      <View style={styles.container}>
        {label ? (
          <View style={styles.labelRow}>
            <Text style={styles.label}>{label}</Text>
            {optional ? <Text style={styles.optional}>Optional</Text> : null}
          </View>
        ) : null}
        <Pressable
          // Not a stop of its own: TalkBack focuses the input, which carries the label.
          accessible={false}
          disabled={!editable}
          onPress={() => inputRef.current?.focus()}
          style={[
            styles.box,
            focused && styles.boxFocused,
            error ? styles.boxError : null,
            !editable && styles.boxDisabled,
          ]}
        >
          {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
          <TextInput
            ref={setRefs}
            accessibilityLabel={label}
            accessibilityHint={error ?? helper}
            editable={editable}
            secureTextEntry={secureTextEntry && !revealed}
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
          {secureTextEntry ? (
            <View style={styles.toggle}>
              <IconButton
                icon={revealed ? EyeOff : Eye}
                label={revealed ? 'Hide password' : 'Show password'}
                onPress={() => setRevealed(shown => !shown)}
              />
            </View>
          ) : null}
        </Pressable>
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

// Theme-based styles for the text field.
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
    // Stretched to the box's full height, so the input itself is as tall as the box.
    input: { ...typography.bodyLg, flex: 1, alignSelf: 'stretch', color: colors.ink, paddingVertical: space[3] },
    numeric: { ...typography.figure },
    inputDisabled: { color: colors.inkDisabled },
    affix: { ...typography.figure, color: colors.ink2 },
    suffix: { ...typography.caption, color: colors.ink2 },
    // The toggle is a full 48 dp target; it sits flush to the box's edge instead of inside its padding.
    toggle: { marginRight: -components.input.paddingX },
    errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[1] },
    error: { ...typography.caption, flex: 1, color: colors.status.danger.mark },
    helper: { ...typography.caption, color: colors.ink3 },
  });
}
