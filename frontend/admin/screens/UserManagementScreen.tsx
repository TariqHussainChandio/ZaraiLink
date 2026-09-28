import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Badge, Button, EmptyState, Sheet, Spinner } from '../../common/components';
import { ROLES, ROLE_LABELS } from '../../common/constants/roles';
import { useProfiles, useSetProfileSuspended, useUpdateUserRole } from '../hooks/admin';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import type { Profile } from '../../common/types/profile';

export function UserManagementScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const currentUserId = useAuthStore(state => state.user?.id);
  const { data: profiles = [], isPending: loading, refetch } = useProfiles();
  const suspend = useSetProfileSuspended();
  const updateRole = useUpdateUserRole();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [roleSheetFor, setRoleSheetFor] = useState<Profile | null>(null);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const toggleSuspend = async (profile: Profile) => {
    if (!currentUserId) return;
    setUpdatingId(profile.id);
    try {
      await suspend.mutateAsync({ id: profile.id, suspended: !profile.is_suspended });
    } catch (error) {
      Alert.alert('Could not update the user', errorMessage(error));
    } finally {
      setUpdatingId(null);
    }
  };

  const changeRole = async (profile: Profile, newRole: Profile['role']) => {
    if (!currentUserId) return;
    setRoleSheetFor(null);
    setUpdatingId(profile.id);
    try {
      await updateRole.mutateAsync({ id: profile.id, role: newRole });
    } catch (error) {
      Alert.alert('Could not update the user', errorMessage(error));
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return <Spinner fullscreen />;

  return (
    <>
      <FlashList
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
        ListEmptyComponent={<EmptyState title="No users found" />}
      />

      <Sheet visible={!!roleSheetFor} onClose={() => setRoleSheetFor(null)}>
        <Text style={styles.sheetTitle}>
          {`Change role for ${roleSheetFor?.full_name}`}
        </Text>
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

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
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
      borderBottomColor: colors.border,
    },
    info: {
      flex: 1,
      marginRight: spacing.sm,
    },
    name: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: colors.text.primary,
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
      fontWeight: typography.weights.bold,
      color: colors.text.primary,
      marginBottom: spacing.lg,
    },
    roleOption: {
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    roleOptionLabel: {
      fontSize: typography.sizes.base,
      color: colors.text.primary,
    },
  });
}
