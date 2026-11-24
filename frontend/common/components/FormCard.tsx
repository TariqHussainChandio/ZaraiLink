// Raised card that holds a form (sign-in, sign-up and other form screens).
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { type Theme, useTheme } from '../../theme';

export interface FormCardProps {
  children: React.ReactNode;
  testID?: string;
}

/** The raised card a form sits in (D20): the sign-up card's padding, border and shadow falling to the right and below,
 * so a form reads as one panel on the field instead of spreading over the whole screen. Sign-in, sign-up, the listing
 * forms and the inventory forms share it. A Card stays flat (it lists facts); only a form is raised. */
export function FormCard({ children, testID }: FormCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.card} testID={testID}>
      {children}
    </View>
  );
}

// Theme-based styles for the form card.
function makeStyles({ colors, space, components, borders, shadows }: Theme) {
  return StyleSheet.create({
    card: {
      gap: components.card.gap + space[2],
      padding: space[5],
      backgroundColor: colors.surface,
      borderRadius: components.card.radius,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      ...shadows.card,
    },
  });
}
