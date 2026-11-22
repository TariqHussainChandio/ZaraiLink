import { Wheat } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../../../hooks/useInsets';
import { type Theme, useTheme } from '../../../theme';

export interface BrandPanelProps {
  /** The line under the wordmark. Left out on the splash screen, which only shows the name. */
  line?: string;
  /** Fill the screen (splash) instead of sitting above a form (sign-in). */
  fill?: boolean;
}

/** The brand's one big moment (D15): the board panel with the wordmark in chalk. No control sits on it. It reaches under
 * the status bar, so its top padding is the safe-area inset plus the usual margin. */
export function BrandPanel({ line, fill = false }: BrandPanelProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useInsets();
  return (
    <View
      style={[styles.panel, fill ? styles.fill : { paddingTop: insets.top + theme.space[6] }]}
      // A header for the screen: TalkBack reads the name once and lands on the form after it.
      accessible
      accessibilityRole="header"
      accessibilityLabel={line ? `ZaraiLink. ${line}` : 'ZaraiLink'}
    >
      <View style={styles.wordmarkRow}>
        <Wheat color={theme.colors.onBoard} size={theme.size.iconLg} strokeWidth={theme.size.iconStroke} />
        <Text style={styles.wordmark}>ZaraiLink</Text>
      </View>
      {line ? <Text style={styles.line}>{line}</Text> : null}
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    panel: {
      backgroundColor: colors.board,
      paddingHorizontal: space[4],
      paddingBottom: space[6],
      gap: space[1],
    },
    fill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[4] },
    wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    wordmark: { ...typography.display, color: colors.onBoard },
    line: { ...typography.body, color: colors.boardInk2 },
  });
}
