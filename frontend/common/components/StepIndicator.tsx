import { Check } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Theme, useTheme } from '../../theme';

export interface StepIndicatorProps {
  /** The step names, in order, kept short ("Account", "Business", "Documents", "Review"). */
  steps: string[];
  /** The index of the step on screen; every step before it is done. */
  current: number;
}

/** Where a person is in a multi-step form (the dealer and expert applications, A3b): numbered discs, done ones ticked. */
export function StepIndicator({ steps, current }: StepIndicatorProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    // A native view of its own (collapsable={false}) so the list role survives Android's view flattening.
    <View style={styles.row} accessibilityRole="list" collapsable={false}>
      {steps.map((label, index) => {
        const done = index < current;
        const now = index === current;
        // TalkBack hears the position and the state, not only the colour.
        const spoken = `Step ${index + 1} of ${steps.length}, ${label}, ${done ? 'done' : now ? 'current step' : 'to come'}`;
        return (
          <View key={label} style={styles.step} accessible accessibilityLabel={spoken}>
            <View style={[styles.disc, done && styles.discDone, now && styles.discNow]}>
              {done ? (
                <Check color={theme.colors.onAccent} size={theme.size.iconSm} strokeWidth={theme.size.iconStrokeBold} />
              ) : (
                <Text style={[styles.number, now && styles.numberNow]}>{index + 1}</Text>
              )}
            </View>
            <Text style={[styles.label, now && styles.labelNow]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function makeStyles({ colors, space, size, radius, borders, typography }: Theme) {
  return StyleSheet.create({
    row: { flexDirection: 'row', gap: space[2] },
    step: { flex: 1, alignItems: 'center', gap: space[1] },
    disc: {
      width: size.iconLg,
      height: size.iconLg,
      borderRadius: radius.pill,
      borderWidth: borders.selected,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    discDone: { backgroundColor: colors.status.success.mark, borderColor: colors.status.success.mark },
    discNow: { borderColor: colors.status.info.mark, backgroundColor: colors.status.info.soft },
    number: { ...typography.caption, color: colors.ink3 },
    numberNow: { color: colors.status.info.mark },
    label: { ...typography.caption, color: colors.ink3 },
    labelNow: { color: colors.ink },
  });
}
