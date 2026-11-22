import { Check } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../../theme';
import type { PaymentMethod } from '../types/payments';

export interface PaymentMethodOptionsProps {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  /** Who the buyer pays, for the sentence under "Cash on delivery": "Chaudhry Seeds". */
  sellerName?: string;
  /** Names the group for a screen reader when several sellers each have one: "How will you pay Chaudhry Seeds?". */
  label?: string;
}

interface Option {
  id: PaymentMethod;
  title: string;
  /** Why it cannot be chosen yet; the option is shown, so the buyer sees it exists and what it needs. */
  unavailable?: string;
}

// Sellers have no bank account details in the system yet, so a buyer would have nowhere to send a transfer. The option
// stays visible but disabled until they do (feature register: bank transfer, Blocked). BR-11: either way the buyer pays
// the seller directly; ZaraiLink holds nothing.
const OPTIONS: Option[] = [
  { id: 'cod', title: 'Cash on delivery' },
  { id: 'bank_transfer', title: 'Bank transfer', unavailable: 'Not offered by this seller yet' },
];

/** How the buyer pays, as a radio group: the chosen method carries a check and the radio state, so it is not marked by its
 * border alone. Used at checkout (one group per seller) and when paying for an order that has no payment yet. */
export function PaymentMethodOptions({ value, onChange, sellerName, label = 'How will you pay?' }: PaymentMethodOptionsProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);

  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={styles.heading}>{label}</Text>
      {OPTIONS.map(option => {
        const disabled = option.unavailable !== undefined;
        const checked = !disabled && value === option.id;
        const detail = option.unavailable ?? (sellerName ? `Pay ${sellerName} in cash when you receive the goods.` : 'Pay the seller in cash when you receive the goods.');
        return (
          <Pressable
            key={option.id}
            style={[styles.option, checked && styles.checked, disabled && styles.disabled]}
            onPress={() => onChange(option.id)}
            disabled={disabled}
            android_ripple={{ color: theme.colors.ripple }}
            accessibilityRole="radio"
            accessibilityLabel={`${option.title}. ${detail}`}
            accessibilityState={{ checked, disabled }}
          >
            <View style={[styles.radio, checked && styles.radioChecked]}>
              {checked ? <Check color={theme.colors.onAccent} size={theme.size.iconSm} strokeWidth={theme.size.iconStrokeBold} /> : null}
            </View>
            <View style={styles.text}>
              <Text style={[styles.title, disabled && styles.muted]}>{option.title}</Text>
              <Text style={styles.detail}>{detail}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles({ colors, space, size, radius, borders, typography }: Theme, accent: Accent) {
  return StyleSheet.create({
    group: { gap: space[2] },
    heading: { ...typography.label, color: colors.ink },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      minHeight: size.row,
      padding: space[3],
      borderRadius: radius.sm,
      borderWidth: borders.control,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    checked: { borderWidth: borders.selected, borderColor: accent.mark, backgroundColor: accent.soft },
    disabled: { borderColor: colors.line, backgroundColor: colors.surfaceSunken },
    radio: {
      width: size.iconMd,
      height: size.iconMd,
      borderRadius: radius.pill,
      borderWidth: borders.control,
      borderColor: colors.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioChecked: { backgroundColor: accent.fill, borderColor: accent.fill },
    text: { flex: 1, minWidth: 0 },
    title: { ...typography.bodyStrong, color: colors.ink },
    muted: { color: colors.inkDisabled },
    detail: { ...typography.caption, color: colors.ink2 },
  });
}
