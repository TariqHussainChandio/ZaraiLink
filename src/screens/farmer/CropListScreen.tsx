import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card, EmptyState, Spinner } from '../../components/ui';
import { HOME_ROUTES } from '../../constants/routes';
import { fetchFarmCrops } from '../../services/modules/farmer/farmService';
import { lightTheme } from '../../theme';
import type { FarmCropWithCrop } from '../../types/farmer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const { colors, spacing, radii, typography } = lightTheme;

export function CropListScreen({ route, navigation }: HomeScreenProps<'CropList'>) {
  const { farmId } = route.params;
  const [crops, setCrops] = useState<FarmCropWithCrop[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      fetchFarmCrops(farmId).then(data => {
        if (!cancelled) {
          setCrops(data);
          setLoading(false);
        }
      }).catch(err => {
        console.warn('[CropListScreen] failed to load crops:', err);
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [farmId]),
  );

  if (loading) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <FlatList
        data={crops}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate(HOME_ROUTES.AddCrop, { farmId, cropId: item.id })}
          >
            <Card style={styles.card}>
              <Text style={styles.name}>{item.crop?.name ?? 'Unspecified crop'}</Text>
              <Text style={styles.meta}>
                {[item.variety, item.growth_stage].filter(Boolean).join(' · ') || 'No details yet'}
              </Text>
              {item.planting_date ? (
                <Text style={styles.meta}>Planted {item.planting_date}</Text>
              ) : null}
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState title="No crops recorded" description="Add the crops growing on this farm." />
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
