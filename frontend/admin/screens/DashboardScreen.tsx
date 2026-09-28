import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Spinner } from '../../common/components';
import { QuickActions } from '../../common/components/dashboards/QuickActions';
import { StatCard } from '../../common/components/dashboards/StatCard';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import { ROLE_LABELS, ROLES } from '../../common/constants/roles';
import { usePlatformStats } from '../hooks/admin';
import { useTheme, type Theme } from '../../theme';
import type { AdminHomeScreenProps } from '../../navigation/stacks/AdminNavigator';

export function AdminDashboardScreen({ navigation }: AdminHomeScreenProps<'Dashboard'>) {
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
        <StatCard label="Total Users" value={stats.totalUsers} accent={theme.moduleAccents.admin} />
        <StatCard label="Listings" value={stats.totalListings} accent={theme.moduleAccents.marketplace} />
        <StatCard label="Orders" value={stats.totalOrders} accent={theme.moduleAccents.orders} />
      </View>

      <Text style={styles.sectionTitle}>Users by Role</Text>
      <View style={styles.statsRow}>
        {ROLES.filter(role => role !== 'admin').map(role => (
          <StatCard key={role} label={ROLE_LABELS[role]} value={stats.usersByRole[role] ?? 0} accent={theme.roleColors[role]} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Manage</Text>
      <QuickActions
        actions={[
          {
            label: 'Analytics',
            onPress: () => navigation.navigate(ADMIN_HOME_ROUTES.Analytics),
          },
          {
            label: 'Manage Users',
            onPress: () => navigation.navigate(ADMIN_HOME_ROUTES.UserManagement),
          },
          {
            label: 'Moderate Listings',
            onPress: () => navigation.navigate(ADMIN_HOME_ROUTES.ListingModeration),
          },
          {
            label: 'Expert Verification',
            onPress: () => navigation.navigate(ADMIN_HOME_ROUTES.ExpertVerification),
          },
          { label: 'Orders', onPress: () => navigation.navigate(ADMIN_HOME_ROUTES.Orders) },
          { label: 'Reports', onPress: () => navigation.navigate(ADMIN_HOME_ROUTES.Reports) },
          {
            label: 'Categories',
            onPress: () => navigation.navigate(ADMIN_HOME_ROUTES.Categories),
          },
          {
            label: 'Reference Data',
            onPress: () => navigation.navigate(ADMIN_HOME_ROUTES.ReferenceData),
          },
          {
            label: 'Audit Logs',
            onPress: () => navigation.navigate(ADMIN_HOME_ROUTES.AuditLogs),
          },
          {
            label: 'Notifications',
            onPress: () => navigation.navigate(ADMIN_HOME_ROUTES.Notifications),
          },
        ]}
      />
    </ScrollView>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    content: {
      padding: spacing.lg,
    },
    statsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginBottom: spacing.xl,
    },
    sectionTitle: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
  });
}
