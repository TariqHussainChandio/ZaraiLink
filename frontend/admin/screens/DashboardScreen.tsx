import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { BadgeCheck, Flag } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, ListGroup, ListRow, ListRowIcon, QueryState, ScreenScaffold } from '../../common/components';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { ADMIN_HOME_ROUTES, ADMIN_TABS } from '../../common/constants/routes';
import { ROLE_LABELS, ROLES } from '../../common/constants/roles';
import { navigateInTab } from '../../navigation/navigateInTab';
import type { AdminScreenProps, AdminTabParamList } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';
import { useDealerApplications, useExpertVerifications, useOpenReports, usePlatformStats } from '../hooks/admin';

/** "4", or "100+" when the list is a full first page and more wait behind it; "—" while the number is not known. */
function count(known: number | undefined, more = false): string {
  if (known === undefined) return '—';
  return more ? `${known}+` : String(known);
}

export function AdminDashboardScreen({ navigation }: AdminScreenProps<'Dashboard'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const tabs = navigation.getParent<BottomTabNavigationProp<AdminTabParamList>>();
  const stats = usePlatformStats();
  const dealers = useDealerApplications('pending');
  const experts = useExpertVerifications('pending');
  const reports = useOpenReports();

  const { refetch: refetchStats } = stats;
  const { refetch: refetchDealers } = dealers;
  const { refetch: refetchExperts } = experts;
  const { refetch: refetchReports } = reports;
  const refetchAll = useCallback(() => {
    refetchStats();
    refetchDealers();
    refetchExperts();
    refetchReports();
  }, [refetchStats, refetchDealers, refetchExperts, refetchReports]);

  useFocusEffect(
    useCallback(() => {
      refetchAll();
    }, [refetchAll]),
  );

  // A figure that could not be loaded stays unknown ("—"), never 0: a zero would say nothing is waiting.
  const applicationsKnown = dealers.data !== undefined && experts.data !== undefined;
  const applications = applicationsKnown ? (dealers.data?.length ?? 0) + (experts.data?.length ?? 0) : undefined;
  const applicationsCapped = (dealers.data?.length ?? 0) >= 100 || (experts.data?.length ?? 0) >= 100;
  const openReports = reports.data?.count;

  const openApprovals = () => navigateInTab(tabs, ADMIN_TABS.Approvals, ADMIN_HOME_ROUTES.Approvals);
  const openReportsList = () => navigateInTab(tabs, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.Reports);

  const needsRow = (title: string, value: string, spoken: string, icon: typeof BadgeCheck, onPress: () => void) => (
    <ListRow
      title={title}
      leading={<ListRowIcon icon={icon} />}
      trailing={<Text style={styles.figure}>{value}</Text>}
      onPress={onPress}
      accessibilityLabel={`${title}: ${spoken}`}
    />
  );

  return (
    <ScreenScaffold onRefresh={refetchAll} refreshing={stats.isRefetching}>
      <View>
        <Text style={styles.heading} accessibilityRole="header">
          Needs you
        </Text>
        <ListGroup>
          {needsRow(
            'Applications waiting',
            count(applications, applicationsCapped),
            applications === undefined ? 'not available' : applications === 0 ? 'none waiting' : `${count(applications, applicationsCapped)} waiting`,
            BadgeCheck,
            openApprovals,
          )}
          {needsRow(
            'Open reports',
            count(openReports, reports.data?.more),
            openReports === undefined ? 'not available' : openReports === 0 ? 'none open' : `${count(openReports, reports.data?.more)} open`,
            Flag,
            openReportsList,
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
                {ROLES.filter(role => role !== 'admin').map(role => (
                  <StatTile key={role} label={ROLE_LABELS[role]} value={stats.data.usersByRole[role] ?? 0} accent={theme.colors.accent[role].mark} />
                ))}
              </View>
            </View>
          </>
        ) : null}
      </QueryState>

      <Button label="See analytics" variant="secondary" onPress={() => navigation.navigate(ADMIN_HOME_ROUTES.Analytics)} />
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
