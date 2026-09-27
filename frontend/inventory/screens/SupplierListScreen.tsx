import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Badge, Card, EmptyState, Spinner } from '../../components/ui';
import { HOME_ROUTES } from '../../constants/routes';
import { useSuppliers } from '../../hooks/api/dealer';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

export function SupplierListScreen({ navigation }: HomeScreenProps<'Suppliers'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const { data: suppliers = [], isPending, error, refetch } = useSuppliers(!!userId);
  const loading = isPending && !!userId;
  const load = () => refetch();

  // Coming back to the list shows what was added or changed elsewhere.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  if (loading) return <Spinner fullscreen />;
  if (error && suppliers.length === 0) {
    return (
      <EmptyState
        title="Couldn't load suppliers"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={suppliers}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate(HOME_ROUTES.SupplierDetail, { supplierId: item.id })}
          >
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.name}>{item.name}</Text>
                <Badge label={item.status} tone={item.status === 'active' ? 'success' : 'neutral'} />
              </View>
              <Text style={styles.meta}>{item.products_supplied ?? 'No products listed'}</Text>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            title="No suppliers yet"
            description="Add your first supplier to get started."
          />
        }
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate(HOME_ROUTES.SupplierDetail, {})}
      >
        <Text style={styles.fabLabel}>+ New Supplier</Text>
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
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
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
