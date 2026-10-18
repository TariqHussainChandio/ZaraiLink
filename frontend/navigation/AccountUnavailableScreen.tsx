import { LogOut, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../common/components';
import { useAuthStore } from '../state/authStore';
import { useTheme, type Theme } from '../theme';
import { logger } from '../utils/logger';

const COPY = {
  offline: {
    title: "We can't check your account while you're offline",
    description: 'Your account decides which part of ZaraiLink opens. Connect to the internet and try again.',
  },
  failed: {
    title: "We couldn't check your account",
    description: 'Try again. If this keeps happening, sign out and sign in again.',
  },
} as const;

/**
 * Shown to a signed-in user whose profile could not be read and is not remembered on this device. The app never
 * guesses a role in its place (B4 verification, F1); Retry reads the profile again, and the auth store also reads it
 * again by itself when the connection returns.
 */
export function AccountUnavailableScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const reason = useAuthStore(state => state.unavailableReason);
  const refreshProfile = useAuthStore(state => state.refreshProfile);
  const signOut = useAuthStore(state => state.signOut);
  const [retrying, setRetrying] = useState(false);

  const offline = reason === 'offline';
  const copy = offline ? COPY.offline : COPY.failed;
  const Icon = offline ? WifiOff : ShieldAlert;

  const retry = async () => {
    setRetrying(true);
    try {
      await refreshProfile();
    } catch (err) {
      logger.warn('AccountUnavailableScreen: retry failed', err);
    } finally {
      setRetrying(false);
    }
  };

  const leave = () => {
    signOut().catch(err => logger.warn('AccountUnavailableScreen: sign-out failed', err));
  };

  return (
    <View style={styles.container}>
      <View style={styles.disc}>
        <Icon color={theme.colors.ink2} size={theme.size.iconLg} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {copy.title}
      </Text>
      <Text style={styles.description}>{copy.description}</Text>
      <View style={styles.actions}>
        <Button label="Retry" icon={RefreshCw} loading={retrying} onPress={retry} />
        <Button label="Sign out" icon={LogOut} variant="quiet" onPress={leave} />
      </View>
    </View>
  );
}

function makeStyles({ colors, space, size, radius, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      padding: space[6],
      gap: space[2],
    },
    disc: {
      width: size.iconDisc,
      height: size.iconDisc,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space[2],
    },
    title: { ...typography.headline, color: colors.ink, textAlign: 'center' },
    description: { ...typography.body, color: colors.ink2, textAlign: 'center' },
    actions: { alignSelf: 'stretch', marginTop: space[6], gap: space[2] },
  });
}
