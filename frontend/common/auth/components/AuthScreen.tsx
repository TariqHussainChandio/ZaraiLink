// Card layout shared by the sign-in, sign-up, code and password reset screens.
import { ArrowLeft, Wheat } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../../../hooks/useInsets';
import { useStatusBarStyle } from '../../../hooks/useStatusBarStyle';
import { type Theme, useTheme } from '../../../theme';
import { IconButton, ScreenScaffold } from '../../components';

export interface AuthScreenProps {
  title: string;
  subtitle?: string;
  /** Sign-in and the welcome page start the card with the ZaraiLink wordmark; the other screens start with their title. */
  brand?: boolean;
  /** Draws a back arrow above the card: these screens have no app bar to carry one. */
  onBack?: () => void;
  children: React.ReactNode;
  testID?: string;
}

/** The frame of every screen outside the app shell (sign-in, sign-up, codes, reset), D20: a padded card centred on the
 * field, its shadow falling to the right and below, instead of a form spread over the whole screen. The page scrolls
 * clear of the keyboard, keeps the safe-area inset at its top (there is no app bar to leave room for the status bar), and
 * the title carries the header role. */
export function AuthScreen({ title, subtitle, brand = false, onBack, children, testID }: AuthScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useInsets();
  // The field is light in the light theme, so the status bar's icons are dark here (the app bars are olive, D20).
  useStatusBarStyle(theme.dark ? 'light-content' : 'dark-content');

  return (
    <ScreenScaffold testID={testID} contentStyle={[styles.page, { paddingTop: insets.top }]}>
      {onBack ? (
        <View style={styles.back}>
          <IconButton icon={ArrowLeft} label="Back" onPress={onBack} />
        </View>
      ) : null}
      <View style={styles.card}>
        {brand ? (
          <View style={styles.wordmarkRow} accessible accessibilityLabel="ZaraiLink">
            <Wheat color={theme.colors.accent.brand.mark} size={theme.size.iconLg} strokeWidth={theme.size.iconStroke} />
            <Text style={styles.wordmark}>ZaraiLink</Text>
          </View>
        ) : null}
        <View style={styles.heading}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </View>
    </ScreenScaffold>
  );
}

// Builds this component's styles from the theme.
function makeStyles({ colors, space, typography, components, borders, shadows }: Theme) {
  return StyleSheet.create({
    // The card sits in the middle of the screen when it is shorter than the screen, and scrolls when it is not.
    page: { flexGrow: 1, justifyContent: 'center', gap: space[2] },
    back: { alignSelf: 'flex-start', marginLeft: -space[3] },
    card: {
      gap: components.card.gap + space[2],
      padding: space[5],
      backgroundColor: colors.surface,
      borderRadius: components.card.radius,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      ...shadows.card,
    },
    wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    wordmark: { ...typography.titleLg, color: colors.accent.brand.ink },
    heading: { gap: space[1] },
    title: { ...typography.headline, color: colors.ink },
    subtitle: { ...typography.body, color: colors.ink2 },
  });
}
