import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Card, EmptyState, Spinner } from '../../components/ui';
import { HOME_ROUTES } from '../../constants/routes';
import { useFarmCrops } from '../../hooks/api/farmer';
import { useTheme, type Theme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

export function CropListScreen({ route, navigation }: HomeScreenProps<'CropList'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { farmId } = route.params;
  const { data: crops = [], isPending: loading, error, refetch } = useFarmCrops(farmId);
  const load = () => refetch();

  // Coming back from adding or editing a crop shows the change.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  if (loading) return <Spinner fullscreen />;
  if (error && crops.length === 0) {
    return (
      <EmptyState
        title="Couldn't load crops"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={crops}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate(HOME_ROUTES.AddCrop, { farmId, cropId: item.id })}
          >
            <Card style={styles.card}>
              <Text style={styles.name}>
                {item.crop?.name ?? 'Unspecified crop'}
              </Text>
              <Text style={styles.meta}>
                {[item.variety, item.growth_stage].filter(Boolean).join(' · ') ||
                  'No details yet'}
              </Text>
              {item.planting_date ? (
                <Text style={styles.meta}>
                  {`Planted ${item.planting_date}`}
                </Text>
              ) : null}
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            title="No crops recorded"
            description="Add the crops growing on this farm."
          />
        }
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate(HOME_ROUTES.AddCrop, { farmId })}
      >
        <Text style={styles.fabLabel}>+ Add Crop</Text>
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
      fontWeight: typography.weights.semibold,
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
