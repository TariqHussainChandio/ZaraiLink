import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../components/ui';
import { QuickActions } from '../../components/features/dashboards/QuickActions';
import { StatCard } from '../../components/features/dashboards/StatCard';
import { ADMIN_HOME_ROUTES } from '../../constants/routes';
import { ROLE_LABELS, ROLES } from '../../constants/roles';
import { fetchPlatformStats, type PlatformStats } from '../../services/modules/admin/adminService';
import { lightTheme } from '../../theme';
import type { AdminHomeScreenProps } from '../../navigation/stacks/AdminNavigator';

const { colors, spacing, typography } = lightTheme;

export function AdminDashboardScreen({ navigation }: AdminHomeScreenProps<'Dashboard'>) {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchPlatformStats().then(data => {
        if (!cancelled) {
          setStats(data);
          setLoading(false);
        }
      }).catch(err => {
        console.warn('[AdminDashboardScreen] failed to load platform stats:', err);
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (loading || !stats) return <Spinner fullscreen />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        <StatCard label="Total Users" value={stats.totalUsers} />
        <StatCard label="Listings" value={stats.totalListings} />
        <StatCard label="Orders" value={stats.totalOrders} />
      </View>

      <Text style={styles.sectionTitle}>Users by Role</Text>
      <View style={styles.statsRow}>
        {ROLES.filter(role => role !== 'admin').map(role => (
          <StatCard key={role} label={ROLE_LABELS[role]} value={stats.usersByRole[role] ?? 0} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
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
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
    marginBottom: spacing.sm,
  },
});
