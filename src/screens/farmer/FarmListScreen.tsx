import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card, EmptyState, Spinner } from '../../components/ui';
import { HOME_ROUTES } from '../../constants/routes';
import { fetchFarms } from '../../services/modules/farmer/farmService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { Farm } from '../../types/farmer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const { colors, spacing, radii, typography } = lightTheme;

export function FarmListScreen({ navigation }: HomeScreenProps<'FarmList'>) {
  const userId = useAuthStore(state => state.user?.id);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      setLoading(true);
      fetchFarms().then(data => {
        if (!cancelled) {
          setFarms(data);
          setLoading(false);
        }
      }).catch(err => {
        console.warn('[FarmListScreen] failed to load farms:', err);
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  if (loading) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <FlatList
        data={farms}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate(HOME_ROUTES.FarmDetail, { farmId: item.id })}
          >
            <Card style={styles.card}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.area ? `${item.area} ${item.land_unit ?? ''}`.trim() : 'Area not set'}
              </Text>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState title="No farms yet" description="Add your first farm to get started." />
        }
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate(HOME_ROUTES.CreateFarm)}
      >
        <Text style={styles.fabLabel}>+ New Farm</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  card: {
    marginBottom: spacing.md,
  },
  name: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  meta: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray500,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.brand.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
  },
  fabLabel: {
    color: colors.neutral.white,
    fontWeight: '700',
  },
});
