import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Card, EmptyState, Spinner } from '../../common/components';
import { HOME_ROUTES } from '../../common/constants/routes';
import { useFarmCrops } from '../hooks/farmer';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

export function CropListScreen({ route, navigation }: HomeScreenProps<'CropList'>) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
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
        accessibilityRole="button"
        style={styles.fab}
        onPress={() => navigation.navigate(HOME_ROUTES.AddCrop, { farmId })}
      >
        <Text style={styles.fabLabel}>+ Add Crop</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles({ colors, space, radius, typography, shadows }: Theme, accent: Accent) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      padding: space[4],
      paddingBottom: space[12],
    },
    card: {
      marginBottom: space[3],
    },
    name: {
      ...typography.bodyStrong,
      color: colors.ink,
    },
    meta: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
    fab: {
      position: 'absolute',
      right: space[4],
      bottom: space[4],
      backgroundColor: accent.fill,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      borderRadius: radius.pill,
      ...shadows.elev2,
    },
    fabLabel: {
      ...typography.label,
      color: colors.onAccent,
    },
  });
}
