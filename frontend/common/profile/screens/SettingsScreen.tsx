import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Chip } from '../../components';
import { PROFILE_ROUTES } from '../../constants/routes';
import { useUpdateProfile } from '../hooks/profile';
import { useAuthStore } from '../../../state/authStore';
import { useThemeStore, type ThemeMode } from '../../../state/themeStore';
import { type Theme, useRoleAccent, useTheme } from '../../../theme';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';
import { errorMessage } from '../../../utils/errorMessage';

const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];
const THEME_MODE_LABELS: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', system: 'System' };

export function SettingsScreen({ navigation }: ProfileScreenProps<'Settings'>) {
  const signOut = useAuthStore(state => state.signOut);
  const profile = useAuthStore(state => state.profile);
  const role = useAuthStore(state => state.role);
  const refreshProfile = useAuthStore(state => state.refreshProfile);
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { mutateAsync: updateProfile } = useUpdateProfile();
  const themeMode = useThemeStore(state => state.mode);
  const setThemeMode = useThemeStore(state => state.setMode);
  const [savingNotifications, setSavingNotifications] = useState(false);

  const onToggleNotifications = async (value: boolean) => {
    setSavingNotifications(true);
    try {
      await updateProfile({ notifications_enabled: value });
      await refreshProfile();
    } catch (error) {
      Alert.alert(
        'Could not update notification setting',
        errorMessage(error),
      );
    } finally {
      setSavingNotifications(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Notifications</Text>
        {/* `accessible` and the label are explicit: TalkBack needs a name for the switch, and
            Testing Library only recognizes iOS's RCTSwitch as accessible by default, not the
            AndroidSwitch this app renders. */}
        <Switch
          accessible
          accessibilityLabel="Notifications"
          value={profile?.notifications_enabled ?? true}
          onValueChange={onToggleNotifications}
          disabled={savingNotifications}
          trackColor={{ true: accent.mark }}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Appearance</Text>
        <View style={styles.chipRow}>
          {THEME_MODES.map(value => (
            <Chip key={value} label={THEME_MODE_LABELS[value]} selected={themeMode === value} onPress={() => setThemeMode(value)} />
          ))}
        </View>
      </View>

      <Button
        label="Change Password"
        variant="secondary"
        onPress={() => navigation.navigate(PROFILE_ROUTES.ChangePassword)}
        style={styles.action}
      />
      {/* P4 (4A.4): only admin write endpoints actually require aal2 today, so this is the one
          role where enrolling has an immediate, visible effect. */}
      {role === 'admin' ? (
        <Button
          label="Two-Factor Authentication"
          variant="secondary"
          onPress={() => navigation.navigate(PROFILE_ROUTES.MfaEnrollment)}
          style={styles.action}
        />
      ) : null}
      <Button
        label="Delete Account"
        variant="secondary"
        onPress={() => navigation.navigate(PROFILE_ROUTES.DeleteAccount)}
        style={styles.action}
      />
      <Button label="Sign Out" variant="danger" onPress={signOut} style={styles.action} />
    </View>
  );
}

function makeStyles({ colors, space, typography, borders }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      padding: space[4],
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: space[3],
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    rowLabel: {
      ...typography.body,
      color: colors.ink,
    },
    chipRow: {
      flexDirection: 'row',
      gap: space[1],
    },
    action: {
      marginTop: space[6],
    },
  });
}
