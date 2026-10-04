import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Card, EmptyState, Spinner } from '../../common/components';
import { HOME_ROUTES } from '../../common/constants/routes';
import { useFarms } from '../hooks/farmer';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

export function FarmListScreen({ navigation }: HomeScreenProps<'FarmList'>) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const userId = useAuthStore(state => state.user?.id);
  const { data: farms = [], isPending, error, refetch } = useFarms(!!userId);
  const loading = isPending && !!userId;
  const load = () => refetch();

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  if (loading) return <Spinner fullscreen />;
  if (error && farms.length === 0) {
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
      <FlashList
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
                {item.area
                  ? `${item.area} ${item.land_unit ?? ''}`.trim()
                  : 'Area not set'}
              </Text>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            title="No farms yet"
            description="Add your first farm to get started."
          />
        }
      />
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.fab}
        onPress={() => navigation.navigate(HOME_ROUTES.CreateFarm)}
      >
        <Text style={styles.fabLabel}>+ New Farm</Text>
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
