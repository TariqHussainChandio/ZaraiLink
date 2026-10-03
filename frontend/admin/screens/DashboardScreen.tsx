import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Spinner } from '../../common/components';
import { QuickActions } from '../../common/components/dashboards/QuickActions';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import { ROLE_LABELS, ROLES } from '../../common/constants/roles';
import { usePlatformStats } from '../hooks/admin';
import { useTheme, type Theme } from '../../theme';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';

export function AdminDashboardScreen({ navigation }: AdminScreenProps<'Dashboard'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { data: stats, isPending: loading, error, refetch } = usePlatformStats();
  const load = () => refetch();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  if (loading) return <Spinner fullscreen />;
  if (error || !stats) {
    return (
      <EmptyState
        title="Couldn't load the dashboard"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        <StatTile label="Total Users" value={stats.totalUsers} accent={theme.colors.accent.admin.mark} />
        <StatTile label="Listings" value={stats.totalListings} accent={theme.colors.module.marketplace} />
        <StatTile label="Orders" value={stats.totalOrders} accent={theme.colors.module.orders} />
      </View>

      <Text style={styles.sectionTitle}>Users by Role</Text>
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
        ]}
      />
    </ScrollView>
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
  });
}
