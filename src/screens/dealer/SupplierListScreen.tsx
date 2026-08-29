import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge, Card, EmptyState, Spinner } from '../../components/ui';
import { HOME_ROUTES } from '../../constants/routes';
import { fetchSuppliers } from '../../services/modules/dealer/supplierService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { Supplier } from '../../types/dealer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const { colors, spacing, radii, typography } = lightTheme;

export function SupplierListScreen({ navigation }: HomeScreenProps<'Suppliers'>) {
  const userId = useAuthStore(state => state.user?.id);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      setLoading(true);
      fetchSuppliers().then(data => {
        if (!cancelled) {
          setSuppliers(data);
          setLoading(false);
        }
      }).catch(err => {
        console.warn('[SupplierListScreen] failed to load suppliers:', err);
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
          <EmptyState title="No suppliers yet" description="Add your first supplier to get started." />
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
