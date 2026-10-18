import { Link2, Pencil, Unlink, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import {
  Banner,
  Button,
  Card,
  ListGroup,
  ListRow,
  ScreenState,
  SelectField,
  StatusBadge,
  useToast,
} from '../../common/components';
import { QuickActions } from '../../common/components/dashboards/QuickActions';
import { useTheme } from '../../theme';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { formatMoney, formatQuantity, productStatus } from '../components/format';
import { MovementRow } from '../components/MovementRow';
import { makeScreenStyles } from '../components/screenStyles';
import { Section } from '../components/Section';
import { inventoryErrorMessage } from '../hooks/errors';
import {
  useLinkListing,
  useListingOptions,
  useMovements,
  useProduct,
  useUnlinkListing,
} from '../hooks/inventory';
import { useLookups } from '../hooks/lookups';
import {
  INVENTORY_ROUTES,
  type InventoryScreenProps,
} from '../types/navigation';

const HISTORY_ROWS = 20;

/** One product: its stock at each location, its recent movements and the marketplace listings it feeds (D8). */
export function ProductDetailScreen({
  route,
  navigation,
}: InventoryScreenProps<typeof INVENTORY_ROUTES.ProductDetail>) {
  const theme = useTheme();
  const styles = useMemo(() => makeScreenStyles(theme), [theme]);
  const { productId } = route.params;
  const result = useProduct(productId);
  const { data: product, refetch, isRefetching } = result;
  const movements = useMovements({ productId });
  const { locationById } = useLookups();
  const [linking, setLinking] = useState(false);
  const [listingId, setListingId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<{ id: string; title: string } | null>(null);
  const listingOptions = useListingOptions(linking);
  const link = useLinkListing(productId);
  const unlink = useUnlinkListing(productId);
  const toast = useToast();

  const linkedIds = useMemo(
    () => new Set((product?.listings ?? []).map(listing => listing.id)),
    [product],
  );
  const choices = useMemo(
    () =>
      (listingOptions.data ?? [])
        .filter(option => !linkedIds.has(option.id))
        .map(option => ({ id: option.id, label: option.title })),
    [listingOptions.data, linkedIds],
  );

  if (!product) {
    return (
      <View style={styles.screen}>
        <ScreenState query={result} errorTitle="Couldn't load this product" />
      </View>
    );
  }

  const operate = (operation: 'in' | 'out' | 'adjust' | 'transfer') =>
    navigation.navigate(INVENTORY_ROUTES.Operation, { operation, productId });

  const onLink = async () => {
    if (!listingId) return;
    setLinkError(null);
    try {
      await link.mutateAsync(listingId);
      setListingId(null);
      setLinking(false);
      toast.success('Listing linked');
    } catch (err) {
      setLinkError(inventoryErrorMessage(err));
    }
  };

  const onUnlink = async () => {
    if (!unlinking) return;
    setLinkError(null);
    try {
      await unlink.mutateAsync(unlinking.id);
      toast.success('Listing unlinked');
    } catch (err) {
      setLinkError(inventoryErrorMessage(err));
    }
    setUnlinking(null);
  };

  const history = (movements.data ?? []).slice(0, HISTORY_ROWS);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
      }
    >
      <Card style={styles.actions}>
        <View style={styles.row}>
          <Text style={[styles.body, theme.typography.titleLg]}>
            {product.name}
          </Text>
        </View>
        <Text
          style={styles.caption}
        >{`SKU ${product.sku}${product.is_active ? '' : ' · Inactive'}`}</Text>
        <View style={styles.row}>
          <Text style={[styles.figure, theme.typography.figureLg]}>
            {formatQuantity(product.total_quantity, product.unit)}
          </Text>
          <StatusBadge kind="stock" status={productStatus(product)} />
        </View>
        {/* The figure above is the total; the status is the default location's, as the alerts judge it (F3). */}
        <Text style={styles.caption}>
          {`${formatQuantity(product.default_location_quantity, product.unit)} at the default location, the stock the marketplace sells and alerts watch`}
        </Text>
        <Text style={styles.caption}>
          {[
            `Reorder at ${formatQuantity(product.reorder_threshold, product.unit)}`,
            product.cost_price != null
              ? `Cost ${formatMoney(product.cost_price)}`
              : null,
            product.selling_price != null
              ? `Price ${formatMoney(product.selling_price)}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Button
          label="Edit product"
          variant="secondary"
          icon={Pencil}
          onPress={() =>
            navigation.navigate(INVENTORY_ROUTES.ProductForm, { productId })
          }
        />
      </Card>

      <QuickActions
        actions={[
          { label: 'Stock in', onPress: () => operate('in') },
          { label: 'Stock out', onPress: () => operate('out') },
          { label: 'Adjust', onPress: () => operate('adjust') },
          { label: 'Transfer', onPress: () => operate('transfer') },
        ]}
      />

      <Section title="Stock by location">
        {(product.stock ?? []).length === 0 ? (
          <Text style={styles.caption}>
            No stock recorded at any location yet.
          </Text>
        ) : (
          <ListGroup>
            {(product.stock ?? []).map(level => (
              <ListRow
                key={level.location_id}
                title={locationById.get(level.location_id)?.name ?? 'Location'}
                meta={
                  locationById.get(level.location_id)?.is_default
                    ? 'Default · sold on the marketplace'
                    : undefined
                }
                trailing={
                  <Text style={styles.figure}>
                    {formatQuantity(level.quantity, product.unit)}
                  </Text>
                }
              />
            ))}
          </ListGroup>
        )}
      </Section>

      <Section title="Marketplace listings">
        <Text style={styles.caption}>
          A dispatched order for a linked listing takes its quantity from the
          default-location stock of this product.
        </Text>
        {(product.listings ?? []).length > 0 ? (
          <ListGroup>
            {(product.listings ?? []).map(listing => (
              <ListRow
                key={listing.id}
                title={listing.title}
                trailing={
                  <Button
                    label="Unlink"
                    variant="quiet"
                    size="sm"
                    icon={Unlink}
                    fullWidth={false}
                    accessibilityLabel={`Unlink ${listing.title}`}
                    onPress={() => setUnlinking({ id: listing.id, title: listing.title })}
                  />
                }
              />
            ))}
          </ListGroup>
        ) : (
          <Text style={styles.body}>Not linked to a listing.</Text>
        )}
        {linkError ? (
          <Banner tone="danger" title="Couldn't change the link">
            {linkError}
          </Banner>
        ) : null}
        {linking ? (
          <Card style={styles.actions}>
            <SelectField
              label="Your listing"
              placeholder={
                listingOptions.isPending
                  ? 'Loading your listings'
                  : 'Choose a listing'
              }
              value={listingId}
              options={choices}
              onSelect={setListingId}
              loading={listingOptions.isPending}
              error={
                listingOptions.error
                  ? inventoryErrorMessage(listingOptions.error)
                  : undefined
              }
            />
            {!listingOptions.isPending &&
            choices.length === 0 &&
            !listingOptions.error ? (
              <Text style={styles.caption}>
                Every one of your listings is already linked here, or you have
                none.
              </Text>
            ) : null}
            <View style={styles.row}>
              <Button
                label="Link"
                icon={Link2}
                fullWidth={false}
                onPress={onLink}
                loading={link.isPending}
                disabled={!listingId}
              />
              <Button
                label="Cancel"
                icon={X}
                variant="quiet"
                fullWidth={false}
                onPress={() => setLinking(false)}
              />
            </View>
          </Card>
        ) : (
          <Button
            label="Link a listing"
            variant="secondary"
            icon={Link2}
            onPress={() => setLinking(true)}
          />
        )}
      </Section>

      <Section
        title="Movement history"
        actionLabel="All"
        onAction={() =>
          navigation.navigate(INVENTORY_ROUTES.Movements, { productId })
        }
      >
        {history.length === 0 ? (
          <Text style={styles.caption}>
            {movements.isPending ? 'Loading movements' : 'No movements yet.'}
          </Text>
        ) : (
          <ListGroup>
            {history.map(movement => (
              <MovementRow
                key={movement.id}
                movement={movement}
                productName={product.name}
                locationName={locationById.get(movement.location_id)?.name}
              />
            ))}
          </ListGroup>
        )}
      </Section>
      <ConfirmSheet
        visible={unlinking !== null}
        title="Unlink this listing?"
        message={`Dispatching "${unlinking?.title ?? ''}" will no longer take stock from this product.`}
        confirmLabel="Unlink"
        confirmIcon={Unlink}
        destructive
        loading={unlink.isPending}
        onConfirm={onUnlink}
        onClose={() => setUnlinking(null)}
      />
    </ScrollView>
  );
}
