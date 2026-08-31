import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';

export function SuspendedScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const signOut = useAuthStore(state => state.signOut);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account Suspended</Text>
      <Text style={styles.description}>
        Your account has been suspended by an administrator. Contact support if you believe this
        is a mistake.
      </Text>
      <Button label="Sign Out" variant="destructive" onPress={signOut} style={styles.action} />
    </View>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background.surface,
      padding: spacing.xl,
    },
    title: {
      fontSize: typography.sizes['2xl'],
      fontWeight: typography.weights.bold as any,
      color: colors.semantic.error,
      marginBottom: spacing.sm,
    },
    description: {
      fontSize: typography.sizes.base,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    action: {
      marginTop: spacing.xl,
    },
  });
}
