import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Badge, Button } from '../../components/ui';
import { PROFILE_ROUTES } from '../../constants/routes';
import { ROLE_LABELS } from '../../constants/roles';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { ProfileScreenProps } from '../../navigation/stacks/ProfileNavigator';

export function ViewProfileScreen({ navigation }: ProfileScreenProps<'ViewProfile'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const profile = useAuthStore(state => state.profile);
  const email = useAuthStore(state => state.user?.email);

  if (!profile) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Avatar name={profile.full_name} uri={profile.avatar_url} size={72} />
        <Text style={styles.name}>{profile.full_name}</Text>
        <Badge label={ROLE_LABELS[profile.role]} tone="info" />
      </View>

      <View style={styles.section}>
        <Row styles={styles} label="Email" value={email ?? '—'} />
        <Row styles={styles} label="Phone" value={profile.phone ?? '—'} />
        <Row styles={styles} label="Location" value={profile.location ?? '—'} />
      </View>

      <Button
        label="Edit Profile"
        onPress={() => navigation.navigate(PROFILE_ROUTES.EditProfile)}
        style={styles.action}
      />
      <Button
        label="Settings"
        variant="secondary"
        onPress={() => navigation.navigate(PROFILE_ROUTES.Settings)}
        style={styles.action}
      />
    </View>
  );
}

function Row({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
      padding: spacing.lg,
    },
    header: {
      alignItems: 'center',
      marginBottom: spacing.xl,
      gap: spacing.sm,
    },
    name: {
      fontSize: typography.sizes.xl,
      fontWeight: typography.weights.bold,
      color: colors.text.primary,
    },
    section: {
      marginBottom: spacing.xl,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowLabel: {
      color: colors.text.secondary,
    },
    rowValue: {
      color: colors.text.primary,
      fontWeight: typography.weights.medium,
    },
    action: {
      marginBottom: spacing.md,
    },
  });
}
