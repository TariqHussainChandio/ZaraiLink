import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../../components/ui';
import { PROFILE_ROUTES } from '../../constants/routes';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, setLanguage, type LanguageCode } from '../../localization';
import { updateProfile } from '../../services/modules/profile/profileService';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore, type ThemeMode } from '../../store/themeStore';
import { useTheme, type Theme } from '../../theme';
import type { ProfileScreenProps } from '../../navigation/stacks/ProfileNavigator';

const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];

export function SettingsScreen({ navigation }: ProfileScreenProps<'Settings'>) {
  const signOut = useAuthStore(state => state.signOut);
  const profile = useAuthStore(state => state.profile);
  const refreshProfile = useAuthStore(state => state.refreshProfile);
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setSavingNotifications(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('settings.notifications')}</Text>
        {/* `accessible` and the label are explicit: TalkBack needs a name for the switch, and
            Testing Library only recognizes iOS's RCTSwitch as accessible by default, not the
            AndroidSwitch this app renders. */}
        <Switch
          accessible
          accessibilityLabel={t('settings.notifications')}
          value={profile?.notifications_enabled ?? true}
          onValueChange={onToggleNotifications}
          disabled={savingNotifications}
          trackColor={{ true: theme.colors.brand.primary }}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('settings.appearance')}</Text>
        <View style={styles.languageRow}>
          {THEME_MODES.map(value => (
            <TouchableOpacity
              key={value}
              style={[styles.languageChip, themeMode === value && styles.languageChipSelected]}
              onPress={() => setThemeMode(value)}
              accessibilityRole="button"
              accessibilityState={{ selected: themeMode === value }}
            >
              <Text
                style={[
                  styles.languageChipLabel,
                  themeMode === value && styles.languageChipLabelSelected,
                ]}
              >
                {t(`settings.appearance${value[0].toUpperCase()}${value.slice(1)}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('settings.language')}</Text>
        <View style={styles.languageRow}>
          {SUPPORTED_LANGUAGES.map(code => (
            <TouchableOpacity
              key={code}
              style={[styles.languageChip, i18n.language === code && styles.languageChipSelected]}
              onPress={() => setLanguage(code as LanguageCode)}
              accessibilityRole="button"
              accessibilityState={{ selected: i18n.language === code }}
            >
              <Text
                style={[
                  styles.languageChipLabel,
                  i18n.language === code && styles.languageChipLabelSelected,
                ]}
              >
                {LANGUAGE_LABELS[code]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Button
        label={t('settings.changePassword')}
        variant="secondary"
        onPress={() => navigation.navigate(PROFILE_ROUTES.ChangePassword)}
        style={styles.action}
      />
      <Button label={t('settings.signOut')} variant="destructive" onPress={signOut} style={styles.action} />
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
    languageRow: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    languageChip: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.border,
    },
    languageChipSelected: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    languageChipLabel: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
      fontWeight: typography.weights.medium as any,
    },
    languageChipLabelSelected: {
      color: colors.neutral.white,
    },
    action: {
      marginTop: spacing.xl,
    },
  });
}
