// Admin: list of users, to suspend or reactivate them and change their role.
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  type AnchorRect,
  anchorFromPress,
  Avatar,
  ChipRow,
  DropdownMenu,
  ListGroup,
  ListRow,
  QueryState,
  RoleBadge,
  ScreenScaffold,
  StatusBadge,
  TextField,
  type ChipOption,
} from '../../common/components';
import { ROLES, ROLE_LABELS, type Role } from '../../common/constants/roles';
import { statusMeta } from '../../common/constants/status';
import type { Profile } from '../../common/types/profile';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { formatDay } from '../../utils/dates';
import { AdminActionSheet, type AdminAction } from '../components/AdminActionSheet';
import { LoadMore } from '../components/LoadMore';
import { useProfilePages, useSetProfileSuspended, useUpdateUserRole } from '../hooks/admin';

type RoleFilter = Role | 'all';
type StatusFilter = Profile['account_status'] | 'all';

// Admin is never offered as a role to give (D17, D19): there is one administrator, set up by the system.
const ROLE_FILTERS: ChipOption<RoleFilter>[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'farmer', label: 'Farmers' },
  { value: 'buyer', label: 'Buyers' },
  { value: 'dealer', label: 'Dealers' },
  { value: 'expert', label: 'Experts' },
  { value: 'admin', label: 'Admin' },
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
  }
  return parts.join(' ');
}

/**
 * Every user: role and suspension (SRDS §8). A dealer's or expert's application is decided in Approvals, after reading it
 * and its documents (A3b), so this list shows the status but offers no decision. The list pages (AD-02); the API filters
 * on role and account status, and the search box looks through the pages already loaded.
 */
export function UserManagementScreen({ route }: Partial<AdminScreenProps<'UserManagement'>>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const currentUserId = useAuthStore(state => state.user?.id);
  const suspend = useSetProfileSuspended();
  const updateRole = useUpdateUserRole();
  const [search, setSearch] = useState('');
  // Opened from a "Users by role" tile, the list starts filtered to that role (D20).
  const [role, setRole] = useState<RoleFilter>(route?.params?.role ?? 'all');
  const [status, setStatus] = useState<StatusFilter>('all');
  // The person whose menu is open, and where on the screen their row was tapped (the menu opens there, D19).
  const [selected, setSelected] = useState<{ profile: Profile; anchor: AnchorRect | null } | null>(null);
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


  // Prepares the confirm sheet to suspend or reactivate a user.
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

  // Prepares the confirm sheet to change a user's role.
  const askRole = (profile: Profile, to: Role) => {
    const name = nameOf(profile);
    setAction({
      title: `Change ${name} to ${ROLE_LABELS[to].toLowerCase()}?`,
      message: roleChangeConsequence(name, profile.role, to),
      confirmLabel: `Change ${name} to ${ROLE_LABELS[to].toLowerCase()}`,
      destructive: profile.role === 'dealer' || profile.role === 'expert',
      run: () => updateRole.mutateAsync({ id: profile.id, role: to }),
      done: `${name} is now a ${ROLE_LABELS[to].toLowerCase()}`,
    });
  };

  const selectedProfile = selected?.profile ?? null;
  const selectedName = selectedProfile ? nameOf(selectedProfile) : '';

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
                  title={nameOf(profile)}
                  meta={identifier(profile, isSelf)}
                  leading={<Avatar uri={profile.avatar_url} name={profile.full_name} role={profile.role} />}
                  status={
                    <View style={styles.badges}>
                      <RoleBadge role={profile.role} />
                      {profile.is_suspended ? <StatusBadge kind="application" status="suspended" /> : null}
                      {needsDecision ? <StatusBadge kind="application" status={profile.account_status} /> : null}
                    </View>
                  }
                  // The admin's own row opens nothing: their role and access are fixed (D19).
                  onPress={isSelf || profile.role === 'admin' ? undefined : event => setSelected({ profile, anchor: anchorFromPress(event) })}
                  accessibilityLabel={`${nameOf(profile)}, ${ROLE_LABELS[profile.role]}${profile.is_suspended ? ', suspended' : ''}${isSelf ? ', you' : ''}`}
                />
              );
            })}
          </ListGroup>
          <LoadMore hasMore={!!query.hasNextPage} loading={query.isFetchingNextPage} onLoadMore={() => query.fetchNextPage()} noun="users" />
        </QueryState>
      </ScreenScaffold>

      {/* One menu at the row: every other role to change to, and the suspension. Each asks for confirmation. */}
      <DropdownMenu
        visible={!!selected}
        anchor={selected?.anchor}
        onClose={() => setSelected(null)}
        label={`Actions for ${selectedName}`}
        items={
          selectedProfile
            ? [
                ...CHOOSABLE_ROLES.filter(r => r !== selectedProfile.role).map(r => ({
                  label: `Change to ${ROLE_LABELS[r].toLowerCase()}`,
                  onPress: () => askRole(selectedProfile, r),
                })),
                {
                  label: selectedProfile.is_suspended ? `Lift suspension for ${selectedName}` : `Suspend ${selectedName}`,
                  onPress: () => askSuspend(selectedProfile),
                  destructive: !selectedProfile.is_suspended,
                },
              ]
            : []
        }
      />

      <AdminActionSheet action={action} onClose={() => setAction(null)} />
    </>
  );
}

/** A profile with no name still needs telling apart from the next one, so it falls back to its short id (A8). */
function nameOf(profile: Profile): string {
  return profile.full_name || `User ${profile.id.slice(0, 8)}`;
}

/**
 * What tells two people apart in the list. Profiles hold no email (it lives in Supabase Auth, which this list does not
 * read), so the phone, city and join date serve, with the short id that is always there (A8).
 */
function identifier(profile: Profile, isSelf: boolean): string {
  return [isSelf ? 'You' : null, profile.phone, profile.city, `Joined ${formatDay(profile.created_at)}`, `#${profile.id.slice(0, 8)}`]
    .filter(Boolean)
    .join(' · ');
}

// Builds the screen's styles from the theme.
function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1] },
  });
}
