import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../components/ui';
import { useTheme, type Theme } from '../../theme';

export function SplashScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('common.splash.appName')}</Text>
      <Spinner />
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
      gap: spacing.lg,
    },
    title: {
      fontSize: typography.sizes['3xl'],
      fontWeight: typography.weights.bold as any,
      color: colors.brand.primary,
    },
  });
}
