import { FlashList } from '@shopify/flash-list';
import { Package, Plus, Search } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { Badge, Button, EmptyState, ListRow, ScreenState, StatusBadge, TextField } from '../../common/components';
import { type Theme, useTheme } from '../../theme';
import { formatQuantity, productStatus } from '../components/format';
import { makeScreenStyles } from '../components/screenStyles';
import { useProducts } from '../hooks/inventory';
import { INVENTORY_ROUTES, type InventoryScreenProps } from '../types/navigation';

/** Every product the dealer stocks, searchable by name or SKU, with its total stock and status. */
export function ProductListScreen({ navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.Products>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const result = useProducts();
  const { data, refetch, isRefetching } = result;
  const [query, setQuery] = useState('');

  const products = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = data ?? [];
    if (!needle) return all;
    return all.filter(
      product => product.name.toLowerCase().includes(needle) || product.sku.toLowerCase().includes(needle),
    );
  }, [data, query]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TextField
          placeholder="Search by name or SKU"
          accessibilityLabel="Search products"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Button
          label="Add product"
          icon={Plus}
          onPress={() => navigation.navigate(INVENTORY_ROUTES.ProductForm, {})}
        />
      </View>
      {/* The search box stays above the list in every state; the list's own empty states cover "none yet" and
          "no match". */}
      <ScreenState query={result} errorTitle="Couldn't load your products">
        {() => (
          <FlashList
            data={products}
            keyExtractor={product => product.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
            renderItem={({ item: product }) => (
              <ListRow
                title={product.name}
                // The badge is the default location's (what alerts and the marketplace go by); the total sits beside it.
                meta={`${product.sku} · ${formatQuantity(product.default_location_quantity, product.unit)} at default · ${formatQuantity(product.total_quantity)} in total`}
                trailing={
                  product.is_active ? (
                    <StatusBadge kind="stock" status={productStatus(product)} size="sm" />
                  ) : (
                    <Badge label="Inactive" size="sm" />
                  )
                }
                onPress={() => navigation.navigate(INVENTORY_ROUTES.ProductDetail, { productId: product.id })}
              />
            )}
            ListEmptyComponent={
              query ? (
                <EmptyState icon={Search} title="No product matches" description="Try another name or SKU." />
              ) : (
                <EmptyState
                  icon={Package}
                  title="No products yet"
                  description="Add the products you stock to start keeping their quantities."
                />
              )
            }
          />
        )}
      </ScreenState>
    </View>
  );
}

function makeStyles(theme: Theme) {
  const base = makeScreenStyles(theme);
  return {
    ...base,
    header: { padding: theme.space[4], gap: theme.space[3] },
    list: { paddingHorizontal: theme.space[4], paddingBottom: theme.space[12] },
  };
}
