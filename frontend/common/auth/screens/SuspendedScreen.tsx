import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';

export function SuspendedScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const signOut = useAuthStore(state => state.signOut);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account Suspended</Text>
      <Text style={styles.description}>Your account has been suspended by an administrator. Contact support if you believe this is a mistake.</Text>
      <Button
        label="Sign Out"
        variant="danger"
        onPress={signOut}
        style={styles.action}
      />
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      padding: space[6],
    },
    title: {
      ...typography.headline,
      color: colors.status.danger.mark,
      marginBottom: space[2],
    },
    description: {
      ...typography.body,
      color: colors.ink2,
      textAlign: 'center',
    },
    action: {
      marginTop: space[6],
    },
  });
}
