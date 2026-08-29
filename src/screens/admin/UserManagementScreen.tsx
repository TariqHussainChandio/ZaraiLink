import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge, Button, Sheet, Spinner } from '../../components/ui';
import { ROLES, ROLE_LABELS } from '../../constants/roles';
import { fetchAllProfiles, setProfileSuspended, updateUserRole } from '../../services/modules/admin/adminService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { Profile } from '../../types/profile';

const { colors, spacing, typography } = lightTheme;

export function UserManagementScreen() {
  const currentUserId = useAuthStore(state => state.user?.id);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [roleSheetFor, setRoleSheetFor] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setProfiles(await fetchAllProfiles());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleSuspend = async (profile: Profile) => {
    if (!currentUserId) return;
    setUpdatingId(profile.id);
    try {
      await setProfileSuspended(profile.id, !profile.is_suspended);
      await load();
    } finally {
      setUpdatingId(null);
    }
  };

  const changeRole = async (profile: Profile, newRole: Profile['role']) => {
    if (!currentUserId) return;
    setRoleSheetFor(null);
    setUpdatingId(profile.id);
    try {
      await updateUserRole(profile.id, newRole);
      await load();
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return <Spinner fullscreen />;

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.list}
        data={profiles}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {item.full_name}
              </Text>
              <View style={styles.badgeRow}>
                <Badge label={ROLE_LABELS[item.role]} tone="info" />
                {item.is_suspended ? <Badge label="Suspended" tone="error" /> : null}
              </View>
            </View>
            {item.id !== currentUserId ? (
              <View style={styles.actions}>
                <Button
                  label="Change Role"
                  variant="secondary"
                  fullWidth={false}
                  loading={updatingId === item.id}
                  onPress={() => setRoleSheetFor(item)}
                />
                <Button
                  label={item.is_suspended ? 'Unsuspend' : 'Suspend'}
                  variant={item.is_suspended ? 'secondary' : 'destructive'}
                  fullWidth={false}
                  loading={updatingId === item.id}
                  onPress={() => toggleSuspend(item)}
                />
              </View>
            ) : null}
          </View>
        )}
      />

      <Sheet visible={!!roleSheetFor} onClose={() => setRoleSheetFor(null)}>
        <Text style={styles.sheetTitle}>Change role for {roleSheetFor?.full_name}</Text>
        {ROLES.filter(role => role !== roleSheetFor?.role).map(role => (
          <TouchableOpacity
            key={role}
            style={styles.roleOption}
            onPress={() => roleSheetFor && changeRole(roleSheetFor, role)}
          >
            <Text style={styles.roleOptionLabel}>{ROLE_LABELS[role]}</Text>
          </TouchableOpacity>
        ))}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  list: {
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.gray100,
  },
  info: {
    flex: 1,
    marginRight: spacing.sm,
  },
  name: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
    marginBottom: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sheetTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold as any,
    color: colors.neutral.gray900,
    marginBottom: spacing.lg,
  },
  roleOption: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.gray100,
  },
  roleOptionLabel: {
    fontSize: typography.sizes.base,
    color: colors.neutral.gray900,
  },
});
