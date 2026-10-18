import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ban, UserCheck, UserCog, Users } from 'lucide-react-native';
import { Button, ListGroup, ListRow, RoleBadge, ScreenState, Sheet, StatusBadge, useToast } from '../../common/components';
import { ROLES, ROLE_LABELS } from '../../common/constants/roles';
import { useProfiles, useSetProfileSuspended, useUpdateUserRole } from '../hooks/admin';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import type { Profile } from '../../common/types/profile';

// Every user: role and suspension. A dealer's or expert's application is decided in Approvals, after reading it and its
// documents (A3b), so this list shows the status but offers no decision.
export function UserManagementScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const currentUserId = useAuthStore(state => state.user?.id);
  const suspend = useSetProfileSuspended();
  const updateRole = useUpdateUserRole();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [roleSheetFor, setRoleSheetFor] = useState<Profile | null>(null);
  // Suspending signs a person out of everything they do on the platform, so it (and lifting it) is confirmed first.
  // The suspend route takes no reason (SuspendUserRequest is is_suspended only), so the sheet asks for none.
  const [suspendSheetFor, setSuspendSheetFor] = useState<Profile | null>(null);
  const profiles = useProfiles();
  const { refetch } = profiles;
  const toast = useToast();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const toggleSuspend = async (profile: Profile) => {
    if (!currentUserId) return;
    setSuspendSheetFor(null);
    setUpdatingId(profile.id);
    try {
      await suspend.mutateAsync({ id: profile.id, suspended: !profile.is_suspended });
      toast.success(profile.is_suspended ? 'User unsuspended' : 'User suspended');
    } catch (error) {
      toast.error(`Could not update the user. ${errorMessage(error)}`);
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
      toast.success(`Role changed to ${ROLE_LABELS[newRole]}`);
    } catch (error) {
      toast.error(`Could not update the user. ${errorMessage(error)}`);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenState query={profiles} errorTitle="Couldn't load the users" empty={{ title: 'No users found', icon: Users }}>
        {shown => (
          <FlashList
            style={styles.container}
            contentContainerStyle={styles.list}
            data={shown}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View>
                  <Text style={styles.name} numberOfLines={1}>
                    {displayName(item)}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {identifier(item)}
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
                    <Button
                      label="Change Role"
                      icon={UserCog}
                      variant="secondary"
                      fullWidth={false}
                      loading={updatingId === item.id}
                      onPress={() => setRoleSheetFor(item)}
                    />
                    <Button
                      label={item.is_suspended ? 'Unsuspend' : 'Suspend'}
                      icon={item.is_suspended ? UserCheck : Ban}
                      variant={item.is_suspended ? 'secondary' : 'danger'}
                      fullWidth={false}
                      loading={updatingId === item.id}
                      onPress={() => setSuspendSheetFor(item)}
                    />
                  </View>
                ) : null}
              </View>
            )}
          />
        )}
      </ScreenState>

      <Sheet
        visible={!!suspendSheetFor}
        onClose={() => setSuspendSheetFor(null)}
        title={`${suspendSheetFor?.is_suspended ? 'Unsuspend' : 'Suspend'} ${suspendSheetFor ? displayName(suspendSheetFor) : ''}`}
      >
        <View style={styles.sheet}>
          <Text style={styles.sheetBody}>
            {suspendSheetFor?.is_suspended
              ? 'They can sign in and use ZaraiLink again.'
              : 'They are signed out and cannot buy, sell, message or consult until you lift the suspension.'}
          </Text>
          {suspendSheetFor ? <Text style={styles.meta}>{identifier(suspendSheetFor)}</Text> : null}
          <Button
            label={suspendSheetFor?.is_suspended ? 'Unsuspend user' : 'Suspend user'}
            icon={suspendSheetFor?.is_suspended ? UserCheck : Ban}
            variant={suspendSheetFor?.is_suspended ? 'primary' : 'danger'}
            onPress={() => suspendSheetFor && toggleSuspend(suspendSheetFor)}
          />
          <Button label="Not now" variant="secondary" onPress={() => setSuspendSheetFor(null)} />
        </View>
      </Sheet>

      <Sheet visible={!!roleSheetFor} onClose={() => setRoleSheetFor(null)} title={`Change role for ${roleSheetFor ? displayName(roleSheetFor) : 'this user'}`}>
        <ListGroup>
          {ROLES.filter(role => role !== roleSheetFor?.role).map(role => (
            <ListRow key={role} title={ROLE_LABELS[role]} onPress={() => roleSheetFor && changeRole(roleSheetFor, role)} />
          ))}
        </ListGroup>
      </Sheet>
    </View>
  );
}

const JOINED = new Intl.DateTimeFormat('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });

/** A profile with no name still needs telling apart from the next one, so it falls back to its short id. */
function displayName(profile: Profile): string {
  return profile.full_name || `User ${profile.id.slice(0, 8)}`;
}

/**
 * What tells two people apart in the list. Profiles hold no email (it lives in Supabase Auth, which this list does not
 * read), so the phone, city and join date serve, with the short id that is always there.
 */
function identifier(profile: Profile): string {
  return [profile.phone, profile.city, `Joined ${JOINED.format(new Date(profile.created_at))}`, `#${profile.id.slice(0, 8)}`]
    .filter(Boolean)
    .join(' · ');
}

function makeStyles({ colors, space, typography, borders }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
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
    meta: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[1],
    },
    sheet: {
      gap: space[3],
    },
    sheetBody: {
      ...typography.body,
      color: colors.ink,
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
