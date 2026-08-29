import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Badge, Button } from '../../components/ui';
import { PROFILE_ROUTES } from '../../constants/routes';
import { ROLE_LABELS } from '../../constants/roles';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { ProfileScreenProps } from '../../navigation/stacks/ProfileNavigator';

const { colors, spacing, typography } = lightTheme;

export function ViewProfileScreen({ navigation }: ProfileScreenProps<'ViewProfile'>) {
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
        <Row label="Email" value={email ?? '—'} />
        <Row label="Phone" value={profile.phone ?? '—'} />
        <Row label="Location" value={profile.location ?? '—'} />
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
    padding: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  name: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold as any,
    color: colors.neutral.gray900,
  },
  section: {
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.gray100,
  },
  rowLabel: {
    color: colors.neutral.gray500,
  },
  rowValue: {
    color: colors.neutral.gray900,
    fontWeight: typography.weights.medium as any,
  },
  action: {
    marginBottom: spacing.md,
  },
});
