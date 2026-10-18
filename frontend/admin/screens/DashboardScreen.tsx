import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, ScreenState, Skeleton } from '../../common/components';
import { QuickActions } from '../../common/components/dashboards/QuickActions';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { ADMIN_HOME_ROUTES, ADMIN_TABS } from '../../common/constants/routes';
import { ROLE_LABELS, ROLES } from '../../common/constants/roles';
import { useAdminQueues, usePlatformStats } from '../hooks/admin';
import { useTheme, type Theme } from '../../theme';
import type { AdminScreenProps, AdminTabParamList } from '../../navigation/stacks/AdminNavigator';

const figure = new Intl.NumberFormat('en-PK');

export function AdminDashboardScreen({ navigation }: AdminScreenProps<'Dashboard'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const platformStats = usePlatformStats();
  const { refetch } = platformStats;
  const queues = useAdminQueues();
  const refetchQueues = queues.refetch;

  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchQueues();
    }, [refetch, refetchQueues]),
  );

  // Each queue lives in another tab's stack; `initial: false` keeps that tab's own first screen under it for Back.
  const tabs = navigation.getParent<BottomTabNavigationProp<AdminTabParamList>>();
  const queueTiles: QueueTileProps[] = queues.data
    ? [
        {
          label: 'Applications',
          count: queues.data.pending_dealer_applications + queues.data.pending_expert_applications,
          onPress: () => tabs?.navigate(ADMIN_TABS.Approvals, { screen: ADMIN_HOME_ROUTES.Approvals }),
        },
        {
          label: 'Reports',
          count: queues.data.open_reports,
          onPress: () => tabs?.navigate(ADMIN_TABS.Moderation, { screen: ADMIN_HOME_ROUTES.Reports, initial: false }),
        },
        {
          label: 'Disputes',
          count: queues.data.disputed_orders,
          onPress: () =>
            tabs?.navigate(ADMIN_TABS.Moderation, { screen: ADMIN_HOME_ROUTES.Orders, params: { status: 'disputed' }, initial: false }),
        },
        {
          label: 'Stale consultations',
          count: queues.data.stale_consultations,
          onPress: () =>
            tabs?.navigate(ADMIN_TABS.Moderation, {
              screen: ADMIN_HOME_ROUTES.ConsultationModeration,
              params: { stale: true },
              initial: false,
            }),
        },
      ]
    : [];

  const queueSkeleton = (
    <View style={styles.statsRow}>
      {[0, 1, 2, 3].map(key => (
        <View key={key} style={styles.queueCell}>
          <Skeleton style={styles.queueSkeleton} />
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenState
        query={platformStats}
        errorTitle="Couldn't load the dashboard"
        skeleton={
          <View style={styles.content}>
            {queueSkeleton}
            {queueSkeleton}
          </View>
        }
      >
        {stats => (
          <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* What waits for the admin (SRDS §14), first: each tile opens its queue. */}
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Waiting for you
            </Text>
            <ScreenState query={queues} errorTitle="Couldn't load the queues" skeleton={queueSkeleton}>
              {() =>
                queueTiles.length ? (
                  <View style={styles.statsRow}>
                    {queueTiles.map(tile => (
                      <QueueTile key={tile.label} {...tile} />
                    ))}
                  </View>
                ) : null
              }
            </ScreenState>

            <View style={styles.statsRow}>
              <StatTile label="Total Users" value={stats.totalUsers} accent={theme.colors.accent.admin.mark} />
              <StatTile label="Listings" value={stats.totalListings} accent={theme.colors.module.marketplace} />
              <StatTile label="Orders" value={stats.totalOrders} accent={theme.colors.module.orders} />
            </View>

            <Text style={styles.sectionTitle} accessibilityRole="header">
              Users by Role
            </Text>
            <View style={styles.statsRow}>
              {ROLES.filter(role => role !== 'admin').map(role => (
                <StatTile key={role} label={ROLE_LABELS[role]} value={stats.usersByRole[role] ?? 0} accent={theme.colors.accent[role].mark} />
              ))}
            </View>

            {/* Approvals, moderation and the audit log have their own tabs; the overview links only what stays here. */}
            <QuickActions
              actions={[
                { label: 'Analytics', onPress: () => navigation.navigate(ADMIN_HOME_ROUTES.Analytics) },
                { label: 'Notifications', onPress: () => navigation.navigate(ADMIN_HOME_ROUTES.Notifications) },
                { label: 'AI activity', onPress: () => navigation.navigate(ADMIN_HOME_ROUTES.AiActivity) },
                { label: 'Disease knowledge', onPress: () => navigation.navigate(ADMIN_HOME_ROUTES.DiseaseKnowledge) },
              ]}
            />
          </ScrollView>
        )}
      </ScreenState>
    </View>
  );
}

interface QueueTileProps {
  label: string;
  count: number;
  onPress: () => void;
}

/** One queue as a figure that opens it; a pressable card, since StatTile is a read-only figure. */
function QueueTile({ label, count, onPress }: QueueTileProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.queueCell}>
      <Card onPress={onPress} accessibilityLabel={`${label}: ${count} waiting`}>
        <Text style={styles.queueLabel}>{label}</Text>
        <Text style={count > 0 ? styles.queueCount : styles.queueCountNone}>{figure.format(count)}</Text>
        <Text style={styles.queueNote}>{count > 0 ? 'Open the queue' : 'Nothing waiting'}</Text>
      </Card>
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: space[4],
    },
    statsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[3],
      marginBottom: space[6],
    },
    sectionTitle: {
      ...typography.bodyStrong,
      color: colors.ink,
      marginBottom: space[2],
    },
    queueSkeleton: {
      height: space[12] * 2,
    },
    // Two across, like StatTile: the cell takes the row's share and the card fills it.
    queueCell: {
      flexGrow: 1,
      flexBasis: '40%',
      minWidth: 0,
    },
    queueLabel: {
      ...typography.caption,
      color: colors.ink2,
    },
    queueCount: {
      ...typography.figureLg,
      color: colors.ink,
    },
    queueCountNone: {
      ...typography.figureLg,
      color: colors.ink3,
    },
    queueNote: {
      ...typography.caption,
      color: colors.ink3,
    },
  });
}
