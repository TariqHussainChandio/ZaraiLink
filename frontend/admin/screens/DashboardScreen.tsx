import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { BadgeCheck, Flag, Scale, Stethoscope } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ListGroup, ListRow, ListRowIcon, QueryState, ScreenScaffold } from '../../common/components';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { ADMIN_HOME_ROUTES, ADMIN_TABS } from '../../common/constants/routes';
import { ROLE_LABELS, ROLES } from '../../common/constants/roles';
import { navigateInTab } from '../../navigation/navigateInTab';
import type { AdminScreenProps, AdminTabParamList } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';
import { useAdminQueues, usePlatformStats } from '../hooks/admin';
import { useNameTitle } from '../../hooks/useNameTitle';

const figure = new Intl.NumberFormat('en-PK');

/** "4", or "—" while the number is not known: a zero would say nothing is waiting. */
function count(known: number | undefined): string {
  return known === undefined ? '—' : figure.format(known);
}

export function AdminDashboardScreen({ navigation }: AdminScreenProps<'Dashboard'>) {
  // D20: the app bar names whose account this is.
  useNameTitle();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const tabs = navigation.getParent<BottomTabNavigationProp<AdminTabParamList>>();
  const stats = usePlatformStats();
  // What waits for the admin (SRDS §14), counted by the server (/admin/queues), so a queue past one page is counted whole.
  const queues = useAdminQueues();

  const { refetch: refetchStats } = stats;
  const { refetch: refetchQueues } = queues;
  const refetchAll = useCallback(() => {
    refetchStats();
    refetchQueues();
  }, [refetchStats, refetchQueues]);

  useFocusEffect(
    useCallback(() => {
      refetchAll();
    }, [refetchAll]),
  );

  const q = queues.data;
  const applications = q ? q.pending_dealer_applications + q.pending_expert_applications : undefined;

  const needsRow = (title: string, value: number | undefined, waiting: string, icon: typeof BadgeCheck, onPress: () => void) => (
    <ListRow
      key={title}
      title={title}
      leading={<ListRowIcon icon={icon} />}
      trailing={<Text style={styles.figure}>{count(value)}</Text>}
      onPress={onPress}
      accessibilityLabel={`${title}: ${value === undefined ? 'not available' : value === 0 ? `none ${waiting}` : `${count(value)} ${waiting}`}`}
    />
  );

  return (
    <ScreenScaffold onRefresh={refetchAll} refreshing={stats.isRefetching || queues.isRefetching}>

      <View>
        <Text style={styles.heading} accessibilityRole="header">
          Needs you
        </Text>
        <ListGroup>
          {needsRow('Applications waiting', applications, 'waiting', BadgeCheck, () =>
            navigateInTab(tabs, ADMIN_TABS.Approvals, ADMIN_HOME_ROUTES.Approvals),
          )}
          {needsRow('Open reports', q?.open_reports, 'open', Flag, () =>
            navigateInTab(tabs, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.Reports),
          )}
          {needsRow('Disputed orders', q?.disputed_orders, 'disputed', Scale, () =>
            navigateInTab(tabs, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.Orders, { status: 'disputed' }),
          )}
          {needsRow('Consultations left open', q?.stale_consultations, 'left open', Stethoscope, () =>
            navigateInTab(tabs, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.ConsultationModeration, { stale: true }),
          )}
        </ListGroup>
      </View>

      <QueryState query={stats} failureTitle="Couldn't load the platform figures">
        {stats.data ? (
          <>
            <View>
              <Text style={styles.heading} accessibilityRole="header">
                Platform
              </Text>
              <View style={styles.tiles}>
                <StatTile
                  label="Users"
                  value={stats.data.totalUsers}
                  onPress={() => navigateInTab(tabs, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.UserManagement)}
                />
                <StatTile
                  label="Listings"
                  value={stats.data.totalListings}
                  accent={theme.colors.module.marketplace}
                  onPress={() => navigateInTab(tabs, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.ListingModeration)}
                />
                <StatTile
                  label="Orders"
                  value={stats.data.totalOrders}
                  accent={theme.colors.module.orders}
                  onPress={() => navigateInTab(tabs, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.Orders)}
                />
              </View>
            </View>

            <View>
              <Text style={styles.heading} accessibilityRole="header">
                Users by role
              </Text>
              <View style={styles.tiles}>
                {/* D20: every figure on the Overview opens what it counts; a role's tile opens Users filtered to it. */}
                {ROLES.filter(role => role !== 'admin').map(role => (
                  <StatTile
                    key={role}
                    label={ROLE_LABELS[role]}
                    value={stats.data.usersByRole[role] ?? 0}
                    accent={theme.colors.accent[role].mark}
                    onPress={() => navigateInTab(tabs, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.UserManagement, { role })}
                  />
                ))}
              </View>
            </View>
          </>
        ) : null}
      </QueryState>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    heading: { ...typography.bodyStrong, color: colors.ink, marginBottom: space[2] },
    figure: { ...typography.figure, color: colors.ink },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  });
}
