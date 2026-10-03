import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Badge, Card, EmptyState, Spinner } from '../../common/components';
import { HOME_ROUTES } from '../../common/constants/routes';
import { useStores } from '../hooks/dealer';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

export function StoreListScreen({ navigation }: HomeScreenProps<'Stores'>) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const userId = useAuthStore(state => state.user?.id);
  const { data: stores = [], isPending, error, refetch } = useStores(!!userId);
  const loading = isPending && !!userId;
  const load = () => refetch();

  // Coming back to the list shows what was added or changed elsewhere.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  if (loading) return <Spinner fullscreen />;
  if (error && stores.length === 0) {
    return (
      <EmptyState
        title="Couldn't load stores"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={stores}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate(HOME_ROUTES.StoreDetail, { storeId: item.id })}
          >
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.name}>{item.name}</Text>
                <Badge label={item.status} tone={item.status === 'active' ? 'success' : 'neutral'} />
              </View>
              <Text style={styles.meta}>{item.address ?? 'No address set'}</Text>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            title="No stores yet"
            description="Add your first store location to get started."
          />
        }
      />
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.fab}
        onPress={() => navigation.navigate(HOME_ROUTES.StoreDetail, {})}
      >
        <Text style={styles.fabLabel}>+ New Store</Text>
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
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
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
