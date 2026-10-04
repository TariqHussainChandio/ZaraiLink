import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import {
  Button,
  ChipRow,
  EmptyState,
  ListGroup,
  ListRow,
  RoleBadge,
  Sheet,
  Spinner,
  StatusBadge,
  TextField,
} from '../../common/components';
import { ROLES, ROLE_LABELS } from '../../common/constants/roles';
import { useDecideDealerApplication, useProfiles, useSetProfileSuspended, useUpdateUserRole } from '../hooks/admin';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import type { Profile } from '../../common/types/profile';

type UserFilter = 'all' | 'pendingDealers';
const FILTERS: { value: UserFilter; label: string }[] = [
  { value: 'all', label: 'All users' },
  { value: 'pendingDealers', label: 'Pending dealers' },
];
// The dealer reads a rejection's reason on their Application Status screen, so it must say something (A3a).
const MIN_REASON = 10;

export function UserManagementScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const currentUserId = useAuthStore(state => state.user?.id);
  const suspend = useSetProfileSuspended();
  const updateRole = useUpdateUserRole();
  const decideDealer = useDecideDealerApplication();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [roleSheetFor, setRoleSheetFor] = useState<Profile | null>(null);
  const [rejectSheetFor, setRejectSheetFor] = useState<Profile | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<UserFilter>('all');
  const { data: shown = [], isPending: loading, refetch } = useProfiles(filter);

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

  const approveDealer = async (profile: Profile) => {
    setUpdatingId(profile.id);
    try {
      await decideDealer.mutateAsync({ id: profile.id, status: 'approved' });
    } catch (error) {
      Alert.alert('Could not approve the dealer', errorMessage(error));
    } finally {
      setUpdatingId(null);
    }
  };

  const openReject = (profile: Profile) => {
    setReason('');
    setReasonError(undefined);
    setRejectSheetFor(profile);
  };

  const rejectDealer = async () => {
    if (!rejectSheetFor) return;
    if (reason.trim().length < MIN_REASON) {
      setReasonError(`Write at least ${MIN_REASON} characters`);
      return;
    }
    const profile = rejectSheetFor;
    setRejectSheetFor(null);
    setUpdatingId(profile.id);
    try {
      await decideDealer.mutateAsync({ id: profile.id, status: 'rejected', reason });
    } catch (error) {
      Alert.alert('Could not reject the dealer', errorMessage(error));
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return <Spinner fullscreen />;

  return (
    <>
      <View style={styles.filters}>
        <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
      </View>
      <FlashList
        style={styles.container}
        contentContainerStyle={styles.list}
        data={shown}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View>
              <Text style={styles.name} numberOfLines={1}>
                {item.full_name || 'Unknown user'}
              </Text>
              <View style={styles.badgeRow}>
                <RoleBadge role={item.role} />
                {item.is_suspended ? <StatusBadge kind="application" status="suspended" /> : null}
                {(item.role === 'dealer' || item.role === 'expert') && item.account_status !== 'approved' ? (
                  <StatusBadge kind="application" status={item.account_status} />
                ) : null}
              </View>
            </View>
            {item.id !== currentUserId ? (
              <View style={styles.actions}>
                {item.role === 'dealer' && item.account_status === 'pending' ? (
                  <>
                    <Button
                      label="Approve"
                      fullWidth={false}
                      loading={updatingId === item.id}
                      onPress={() => approveDealer(item)}
                    />
                    <Button
                      label="Reject"
                      variant="danger"
                      fullWidth={false}
                      loading={updatingId === item.id}
                      onPress={() => openReject(item)}
                    />
                  </>
                ) : null}
                <Button
                  label="Change Role"
                  variant="secondary"
                  fullWidth={false}
                  loading={updatingId === item.id}
                  onPress={() => setRoleSheetFor(item)}
                />
                <Button
                  label={item.is_suspended ? 'Unsuspend' : 'Suspend'}
                  variant={item.is_suspended ? 'secondary' : 'danger'}
                  fullWidth={false}
                  loading={updatingId === item.id}
                  onPress={() => toggleSuspend(item)}
                />
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <EmptyState title={filter === 'pendingDealers' ? 'No dealer is waiting for a decision' : 'No users found'} />
        }
      />

      <Sheet visible={!!roleSheetFor} onClose={() => setRoleSheetFor(null)} title={`Change role for ${roleSheetFor?.full_name || 'this user'}`}>
        <ListGroup>
          {ROLES.filter(role => role !== roleSheetFor?.role).map(role => (
            <ListRow key={role} title={ROLE_LABELS[role]} onPress={() => roleSheetFor && changeRole(roleSheetFor, role)} />
          ))}
        </ListGroup>
      </Sheet>

      <Sheet
        visible={!!rejectSheetFor}
        onClose={() => setRejectSheetFor(null)}
        title={`Reject ${rejectSheetFor?.full_name || 'this dealer'}`}
      >
        <View style={styles.sheetBody}>
          <TextField
            label="Reason"
            helper="The dealer reads this and can send the application again."
            value={reason}
            onChangeText={setReason}
            error={reasonError}
            multiline
          />
          <Button label="Reject application" variant="danger" onPress={rejectDealer} />
        </View>
      </Sheet>
    </>
  );
}

function makeStyles({ colors, space, typography, borders }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    filters: {
      paddingTop: space[3],
      paddingHorizontal: space[4],
      backgroundColor: colors.surface,
    },
    sheetBody: {
      gap: space[3],
    },
    list: {
      padding: space[4],
    },
    row: {
      gap: space[2],
      paddingVertical: space[3],
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    name: {
      ...typography.bodyStrong,
      color: colors.ink,
      marginBottom: space[1],
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[1],
    },
    // Up to four actions (Approve, Reject, Change Role, Suspend) wrap under the name instead of squeezing it away
    // (A3a verification, H3).
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
    },
  });
}
