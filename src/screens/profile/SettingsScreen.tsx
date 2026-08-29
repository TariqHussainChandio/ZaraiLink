import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../../components/ui';
import { PROFILE_ROUTES } from '../../constants/routes';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, setLanguage, type LanguageCode } from '../../localization';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { ProfileScreenProps } from '../../navigation/stacks/ProfileNavigator';

const { colors, spacing, radii, typography } = lightTheme;

export function SettingsScreen({ navigation }: ProfileScreenProps<'Settings'>) {
  const signOut = useAuthStore(state => state.signOut);
  const { t, i18n } = useTranslation();
  // Local-only stub — there's no notification-preferences table yet.
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('settings.notifications')}</Text>
        <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} />
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('settings.language')}</Text>
        <View style={styles.languageRow}>
          {SUPPORTED_LANGUAGES.map(code => (
            <TouchableOpacity
              key={code}
              style={[styles.languageChip, i18n.language === code && styles.languageChipSelected]}
              onPress={() => setLanguage(code as LanguageCode)}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.gray100,
  },
  rowLabel: {
    fontSize: typography.sizes.base,
    color: colors.neutral.gray900,
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
    borderColor: colors.neutral.gray300,
  },
  languageChipSelected: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  languageChipLabel: {
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray700,
    fontWeight: typography.weights.medium as any,
  },
  languageChipLabelSelected: {
    color: colors.neutral.white,
  },
  action: {
    marginTop: spacing.xl,
  },
});
