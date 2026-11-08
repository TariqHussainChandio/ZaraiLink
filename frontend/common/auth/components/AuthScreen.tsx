import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../../../hooks/useInsets';
import { type Theme, useTheme } from '../../../theme';
import { ScreenScaffold } from '../../components';
import { BrandPanel } from './BrandPanel';

export interface AuthScreenProps {
  title: string;
  subtitle?: string;
  /** Sign-in puts the brand panel on top; the other screens start with their title. */
  brand?: boolean;
  children: React.ReactNode;
  testID?: string;
}

/** The frame of every screen outside the app shell (sign-in, sign-up, codes, reset): a `ground` page that scrolls clear of
 * the keyboard, with the safe-area inset at its top (these screens have no app bar to leave room for the status bar), and
 * a `headline` title with the header role. */
export function AuthScreen({ title, subtitle, brand = false, children, testID }: AuthScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useInsets();
  const body = (
    <ScreenScaffold testID={testID} contentStyle={brand ? undefined : { paddingTop: insets.top }}>
      <View style={styles.heading}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </ScreenScaffold>
  );
  if (!brand) return body;
  return (
    <View style={styles.page}>
      <BrandPanel line="Buy, sell and get crop advice." />
      {body}
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.ground },
    heading: { gap: space[1] },
    title: { ...typography.headline, color: colors.ink },
    subtitle: { ...typography.body, color: colors.ink2 },
  });
}
