import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../../components';
import { PROFILE_ROUTES } from '../../constants/routes';
import { useUpdateProfile } from '../hooks/profile';
import { useAuthStore } from '../../../state/authStore';
import { useThemeStore, type ThemeMode } from '../../../state/themeStore';
import { useTheme, type Theme } from '../../../theme';
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
          trackColor={{ true: theme.colors.brand.primary }}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Appearance</Text>
        <View style={styles.chipRow}>
          {THEME_MODES.map(value => (
            <TouchableOpacity
              key={value}
              style={[styles.chip, themeMode === value && styles.chipSelected]}
              onPress={() => setThemeMode(value)}
              accessibilityRole="button"
              accessibilityState={{ selected: themeMode === value }}
            >
              <Text
                style={[
                  styles.chipLabel,
                  themeMode === value && styles.chipLabelSelected,
                ]}
              >
                {THEME_MODE_LABELS[value]}
              </Text>
            </TouchableOpacity>
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
      <Button label="Sign Out" variant="destructive" onPress={signOut} style={styles.action} />
    </View>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
      padding: spacing.lg,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowLabel: {
      fontSize: typography.sizes.base,
      color: colors.text.primary,
    },
    chipRow: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    chip: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipSelected: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    chipLabel: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
      fontWeight: typography.weights.medium,
    },
    chipLabelSelected: {
      color: colors.neutral.white,
    },
    action: {
      marginTop: spacing.xl,
    },
  });
}
