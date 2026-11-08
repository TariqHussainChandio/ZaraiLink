import { CircleAlert, Minus, Plus } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { type Theme, useTheme } from '../../theme';
import { formatAmount } from '../../utils/money';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  /** The least allowed; usually 1. */
  min?: number;
  /** The most allowed: the stock. Without it the quantity is not capped. */
  max?: number;
  /** What is counted, singular: "bag". It names the buttons ("One more bag") and the message ("Only 340 bags in stock"). */
  unit: string;
  /** Defaults to the unit with an "s". */
  unitPlural?: string;
}

/** Sets a whole quantity: − / the number / +. Each button is a 48 dp target; − stops at `min` and + at `max`. The number
 * is in the board face, and tapping it opens a numeric box, for a large order. Over the stock it says so inline. Used
 * before Add to cart, in each cart line, and when recording stock. */
export function QuantityStepper({ value, onChange, min = 1, max, unit, unitPlural = `${unit}s` }: QuantityStepperProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  // Set when a typed number was cut down to the stock, so the reason stays on screen after the number is corrected.
  const [capped, setCapped] = useState(false);

  const noun = (count: number) => (count === 1 ? unit : unitPlural);
  const overStock = max !== undefined && (capped || value > max);
  const clamp = (n: number) => {
    const atLeastMin = Math.max(min, n);
    return max === undefined ? atLeastMin : Math.min(max, atLeastMin);
  };

  const step = (delta: number) => {
    setCapped(false);
    onChange(clamp(value + delta));
  };

  const commit = () => {
    setTyping(false);
    // Digits only: "1,500" is 1500, never 0, and a pasted "12 bags" is 12.
    const typed = draft.replace(/\D/g, '');
    if (!typed) return;
    const wanted = Number(typed);
    setCapped(max !== undefined && wanted > max);
    onChange(clamp(wanted));
  };

  return (
    <View style={styles.container}>
      <View style={styles.control}>
        <Pressable
          style={styles.step}
          onPress={() => step(-1)}
          disabled={value <= min}
          android_ripple={{ color: theme.colors.ripple }}
          accessibilityRole="button"
          accessibilityLabel={`One fewer ${unit}`}
          accessibilityState={{ disabled: value <= min }}
        >
          <Minus color={value <= min ? theme.colors.inkDisabled : theme.colors.ink} size={theme.size.iconMd} />
        </Pressable>
        {typing ? (
          <TextInput
            style={[styles.value, styles.input]}
            value={draft}
            onChangeText={setDraft}
            onBlur={commit}
            onSubmitEditing={commit}
            keyboardType="number-pad"
            autoFocus
            selectTextOnFocus
            accessibilityLabel={`Number of ${unitPlural}`}
          />
        ) : (
          <Pressable
            style={styles.valueBox}
            onPress={() => {
              setDraft(String(value));
              setTyping(true);
            }}
            android_ripple={{ color: theme.colors.ripple }}
            accessibilityRole="button"
            accessibilityLabel={`${formatAmount(value)} ${noun(value)}`}
            accessibilityHint="Opens a box to type the number"
          >
            <Text style={styles.value}>{formatAmount(value)}</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.step}
          onPress={() => step(1)}
          disabled={max !== undefined && value >= max}
          android_ripple={{ color: theme.colors.ripple }}
          accessibilityRole="button"
          accessibilityLabel={`One more ${unit}`}
          accessibilityState={{ disabled: max !== undefined && value >= max }}
        >
          <Plus color={max !== undefined && value >= max ? theme.colors.inkDisabled : theme.colors.ink} size={theme.size.iconMd} />
        </Pressable>
      </View>
      {overStock && max !== undefined ? (
        <View style={styles.messageRow} accessibilityLiveRegion="polite">
          <CircleAlert color={theme.colors.status.danger.mark} size={theme.size.iconSm} />
          <Text style={styles.message}>{`Only ${formatAmount(max)} ${noun(max)} in stock`}</Text>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles({ colors, space, size, borders, radius, typography }: Theme) {
  return StyleSheet.create({
    container: { gap: space[1], alignSelf: 'flex-start' },
    control: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: borders.control,
      borderColor: colors.lineStrong,
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    step: { width: size.touchMin, height: size.touchMin, alignItems: 'center', justifyContent: 'center' },
    valueBox: { minWidth: size.thumb, height: size.touchMin, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[2] },
    value: { ...typography.price, color: colors.ink, textAlign: 'center' },
    input: { minWidth: size.thumb, height: size.touchMin, paddingVertical: 0 },
    messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[1] },
    message: { ...typography.caption, flex: 1, color: colors.status.danger.mark },
  });
}
