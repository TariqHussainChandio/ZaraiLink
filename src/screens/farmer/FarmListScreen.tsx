import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card, EmptyState, Spinner } from '../../components/ui';
import { HOME_ROUTES } from '../../constants/routes';
import { fetchFarms } from '../../services/modules/farmer/farmService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { Farm } from '../../types/farmer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

export function FarmListScreen({ navigation }: HomeScreenProps<'FarmList'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!userId) return () => {};
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchFarms().then(data => {
      if (!cancelled) {
        setFarms(data);
        setLoading(false);
      }
    }).catch(err => {
      console.warn('[FarmListScreen] failed to load farms:', err);
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useFocusEffect(useCallback(() => load(), [load]));

  if (loading) return <Spinner fullscreen />;
  if (error) {
    return (
      <EmptyState
        title="Couldn't load farms"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

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

function makeStyles({ colors, spacing, radii, typography, shadows }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
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
      color: colors.text.primary,
    },
    meta: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
    fab: {
      position: 'absolute',
      right: spacing.lg,
      bottom: spacing.lg,
      backgroundColor: colors.brand.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radii.full,
      ...shadows.md,
    },
    fabLabel: {
      color: colors.neutral.white,
      fontWeight: '700',
    },
  });
}
