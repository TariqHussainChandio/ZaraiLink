import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Avatar,
  ChipRow,
  ListGroup,
  ListRow,
  QueryState,
  RoleBadge,
  ScreenScaffold,
  Sheet,
  StatusBadge,
  TextField,
  type ChipOption,
} from '../../common/components';
import { ROLES, ROLE_LABELS, type Role } from '../../common/constants/roles';
import { statusMeta } from '../../common/constants/status';
import type { Profile } from '../../common/types/profile';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { formatDay } from '../../utils/dates';
import { AdminActionSheet, type AdminAction } from '../components/AdminActionSheet';
import { LoadMore } from '../components/LoadMore';
import { useProfilePages, useSetProfileSuspended, useUpdateUserRole } from '../hooks/admin';

type RoleFilter = Role | 'all';
type StatusFilter = Profile['account_status'] | 'all';

// Admin is not offered anywhere in the app (D17): an administrator is made outside it.
const ROLE_FILTERS: ChipOption<RoleFilter>[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'farmer', label: 'Farmers' },
  { value: 'buyer', label: 'Buyers' },
  { value: 'dealer', label: 'Dealers' },
  { value: 'expert', label: 'Experts' },
  { value: 'admin', label: 'Admins' },
];
const STATUS_FILTERS: ChipOption<StatusFilter>[] = [
  { value: 'all', label: 'Any status' },
  { value: 'pending', label: statusMeta('application', 'pending').label },
  { value: 'approved', label: statusMeta('application', 'approved').label },
  { value: 'rejected', label: statusMeta('application', 'rejected').label },
];
const CHOOSABLE_ROLES = ROLES.filter(role => role !== 'admin');

/** What changing this person's role does to them, in words (D17). The database resets the approval on every role change
 * (guard_profiles_role, 20261012080000_applications.sql): a dealer or expert starts again at "Under review", and nobody
 * keeps an approval from a role they have left. */
function roleChangeConsequence(name: string, from: Role, to: Role): string {
  const parts: string[] = [];
  if (to === 'dealer' || to === 'expert') {
    parts.push(`${name} becomes a ${ROLE_LABELS[to].toLowerCase()} but goes back to Under review. They cannot sell or use inventory until you approve a new application.`);
  } else {
    parts.push(`${name} becomes a ${ROLE_LABELS[to].toLowerCase()}.`);
  }
  if (from === 'dealer' || from === 'expert') {
    parts.push(`They lose their ${ROLE_LABELS[from].toLowerCase()} approval, and with it ${from === 'dealer' ? 'selling and inventory access' : 'their place among verified experts'}. Changing back does not restore it.`);
  } else if (from === 'admin') {
    parts.push('They lose admin access.');
  }
  return parts.join(' ');
}

/**
 * Every user: role and suspension (SRDS §8). A dealer's or expert's application is decided in Approvals, after reading it
 * and its documents (A3b), so this list shows the status but offers no decision. The list pages (AD-02); the API filters
 * on role and account status, and the search box looks through the pages already loaded.
 */
export function UserManagementScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const currentUserId = useAuthStore(state => state.user?.id);
  const suspend = useSetProfileSuspended();
  const updateRole = useUpdateUserRole();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Profile | null>(null);
  const [choosingRoleFor, setChoosingRoleFor] = useState<Profile | null>(null);
  const [action, setAction] = useState<AdminAction | null>(null);

  const needle = search.trim().toLowerCase();
  const query = useProfilePages(
    { role: role === 'all' ? undefined : role, accountStatus: status === 'all' ? undefined : status },
    needle.length > 0,
  );
  const { rows, refetch } = query;

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const shown = needle
    ? rows.filter(p => p.full_name.toLowerCase().includes(needle) || (p.phone ?? '').replace(/\s/g, '').includes(needle.replace(/\s/g, '')))
    : rows;
  const filtered = needle.length > 0 || role !== 'all' || status !== 'all';

  const nameOf = (profile: Profile) => profile.full_name || 'this user';

  const askSuspend = (profile: Profile) => {
    const name = nameOf(profile);
    const lifting = profile.is_suspended;
    setSelected(null);
    setAction(
      lifting
        ? {
            title: `Lift the suspension on ${name}?`,
            message: `${name} can sign in and use ZaraiLink again.`,
            confirmLabel: `Lift suspension for ${name}`,
            run: () => suspend.mutateAsync({ id: profile.id, suspended: false }),
            done: `${name} can use ZaraiLink again`,
            undo: () => suspend.mutateAsync({ id: profile.id, suspended: true }),
          }
        : {
            title: `Suspend ${name}?`,
            message: `${name} is signed out and cannot use ZaraiLink until you lift the suspension. Their listings and orders are not changed.`,
            confirmLabel: `Suspend ${name}`,
            destructive: true,
            run: () => suspend.mutateAsync({ id: profile.id, suspended: true }),
            done: `${name} suspended`,
            undo: () => suspend.mutateAsync({ id: profile.id, suspended: false }),
          },
    );
  };

  const askRole = (profile: Profile, to: Role) => {
    const name = nameOf(profile);
    setChoosingRoleFor(null);
    setAction({
      title: `Change ${name} to ${ROLE_LABELS[to].toLowerCase()}?`,
      message: roleChangeConsequence(name, profile.role, to),
      confirmLabel: `Change ${name} to ${ROLE_LABELS[to].toLowerCase()}`,
      destructive: profile.role === 'dealer' || profile.role === 'expert' || profile.role === 'admin',
      run: () => updateRole.mutateAsync({ id: profile.id, role: to }),
      done: `${name} is now a ${ROLE_LABELS[to].toLowerCase()}`,
    });
  };

  const selectedName = selected ? nameOf(selected) : '';

  return (
    <>
      <ScreenScaffold onRefresh={() => refetch()} refreshing={query.isRefetching && !query.isFetchingNextPage}>
        <TextField label="Find a person" placeholder="Name or phone number" value={search} onChangeText={setSearch} autoCorrect={false} />
        <View>
          <ChipRow options={ROLE_FILTERS} value={role} onChange={setRole} />
          <ChipRow options={STATUS_FILTERS} value={status} onChange={setStatus} />
        </View>
        <QueryState
          query={query}
          failureTitle="Couldn't load users"
          isEmpty={shown.length === 0 && !query.hasNextPage && !query.isFetching}
          empty={
            filtered
              ? { title: 'No one matches', description: 'Try a different name, role or status.' }
              : { title: 'No users yet', description: 'People appear here once they sign up.' }
          }
        >
          <ListGroup>
            {shown.map(profile => {
              const isSelf = profile.id === currentUserId;
              const needsDecision = (profile.role === 'dealer' || profile.role === 'expert') && profile.account_status !== 'approved';
              return (
                <ListRow
                  key={profile.id}
                  title={profile.full_name || 'Unknown user'}
                  meta={[isSelf ? 'You' : null, profile.phone, `Joined ${formatDay(profile.created_at)}`].filter(Boolean).join(' · ')}
                  leading={<Avatar uri={profile.avatar_url} name={profile.full_name} role={profile.role} />}
                  status={
                    <View style={styles.badges}>
                      <RoleBadge role={profile.role} />
                      {profile.is_suspended ? <StatusBadge kind="application" status="suspended" /> : null}
                      {needsDecision ? <StatusBadge kind="application" status={profile.account_status} /> : null}
                    </View>
                  }
                  onPress={isSelf ? undefined : () => setSelected(profile)}
                  accessibilityLabel={`${profile.full_name || 'Unknown user'}, ${ROLE_LABELS[profile.role]}${profile.is_suspended ? ', suspended' : ''}${isSelf ? ', you' : ''}`}
                />
              );
            })}
          </ListGroup>
          <LoadMore hasMore={!!query.hasNextPage} loading={query.isFetchingNextPage} onLoadMore={() => query.fetchNextPage()} noun="users" />
        </QueryState>
      </ScreenScaffold>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selectedName}>
        <ListGroup>
          <ListRow
            title="Change role"
            meta={selected ? `Now ${ROLE_LABELS[selected.role].toLowerCase()}` : undefined}
            onPress={() => {
              setChoosingRoleFor(selected);
              setSelected(null);
            }}
          />
          <ListRow
            title={selected?.is_suspended ? `Lift suspension for ${selectedName}` : `Suspend ${selectedName}`}
            onPress={() => selected && askSuspend(selected)}
          />
        </ListGroup>
      </Sheet>

      <Sheet visible={!!choosingRoleFor} onClose={() => setChoosingRoleFor(null)} title={`Change role for ${choosingRoleFor ? nameOf(choosingRoleFor) : ''}`}>
        <ListGroup>
          {CHOOSABLE_ROLES.filter(r => r !== choosingRoleFor?.role).map(r => (
            <ListRow key={r} title={ROLE_LABELS[r]} onPress={() => choosingRoleFor && askRole(choosingRoleFor, r)} />
          ))}
        </ListGroup>
      </Sheet>

      <AdminActionSheet action={action} onClose={() => setAction(null)} />
    </>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1] },
  });
}
