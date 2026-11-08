import { CircleAlert } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Theme, useTheme } from '../../../theme';

export interface ChoiceGroupProps {
  label: string;
  /** Marks a group that can be left empty. */
  optional?: boolean;
  /** The cause and the fix; announced and drawn like a text field's error. */
  error?: string;
  /** `radiogroup` for pick-one chips, none for pick-several. */
  single?: boolean;
  helper?: string;
  children: React.ReactNode;
}

/** A label above a set of chips, set like a TextField's label so a form reads as one: the label is in the `label` style, the
 * chips wrap onto new lines instead of scrolling out of sight, and an error sits under them with its icon. TalkBack
 * reads the group by its label. */
export function ChoiceGroup({ label, optional, error, single = false, helper, children }: ChoiceGroupProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.container} accessibilityRole={single ? 'radiogroup' : undefined} accessibilityLabel={label}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {optional ? <Text style={styles.optional}>Optional</Text> : null}
      </View>
      <View style={styles.chips}>{children}</View>
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
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    container: { marginBottom: space[4], gap: space[2] },
    labelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
    label: { ...typography.label, color: colors.ink },
    optional: { ...typography.caption, color: colors.ink3 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
    error: { ...typography.caption, color: colors.status.danger.mark, flexShrink: 1 },
    helper: { ...typography.caption, color: colors.ink3 },
  });
}
