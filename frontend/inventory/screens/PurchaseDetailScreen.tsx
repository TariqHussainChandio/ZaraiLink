import { CircleX, PackageCheck, Pencil } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Banner, Button, Card, ListGroup, ListRow, ScreenState, StatusBadge, useToast } from '../../common/components';
import { hapticSuccess } from '../../utils/haptics';
import { useTheme } from '../../theme';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { formatDate, formatMoney, formatQuantity } from '../components/format';
import { makeScreenStyles } from '../components/screenStyles';
import { Section } from '../components/Section';
import { inventoryErrorMessage } from '../hooks/errors';
import { useCancelPurchase, usePurchase, useReceivePurchase, useSuppliers } from '../hooks/inventory';
import { useLookups } from '../hooks/lookups';
import { INVENTORY_ROUTES, type InventoryScreenProps } from '../types/navigation';

type Confirming = 'receive' | 'cancel' | null;

/** One purchase: its lines, and for a draft, editing it, receiving it into stock (once) or cancelling it. A received or
 * cancelled purchase is final: the server refuses a second receive or an edit (409), and the screen says so. */
export function PurchaseDetailScreen({ route, navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.PurchaseDetail>) {
  const theme = useTheme();
  const styles = useMemo(() => makeScreenStyles(theme), [theme]);
  const { purchaseId } = route.params;
  const result = usePurchase(purchaseId);
  const { data: purchase, refetch, isRefetching } = result;
  const suppliers = useSuppliers();
  const { productById, locationById } = useLookups();
  const receive = useReceivePurchase();
  const cancel = useCancelPurchase();
  const toast = useToast();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);

  if (!purchase) {
    return (
      <View style={styles.screen}>
        <ScreenState query={result} errorTitle="Couldn't load this purchase" />
      </View>
    );
  }

  const supplier = purchase.supplier_id ? suppliers.data?.find(item => item.id === purchase.supplier_id) : undefined;
  const items = purchase.items ?? [];
  const total = items.reduce((sum, item) => sum + (item.unit_cost ?? 0) * item.quantity, 0);
  const costed = items.some(item => item.unit_cost != null);

  const onReceive = async () => {
    setActionError(null);
    try {
      await receive.mutateAsync(purchaseId);
      hapticSuccess();
      toast.success('Purchase received into stock');
    } catch (err) {
      setActionError(inventoryErrorMessage(err));
      // A refusal means the copy on screen is old (received or cancelled elsewhere): show what it is now.
      refetch();
    }
    setConfirming(null);
  };

  const onCancel = async () => {
    setActionError(null);
    try {
      await cancel.mutateAsync(purchaseId);
      toast.success('Purchase cancelled');
    } catch (err) {
      setActionError(inventoryErrorMessage(err));
      refetch();
    }
    setConfirming(null);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
    >
      <Card style={styles.actions}>
        <View style={styles.row}>
          <Text style={[styles.body, styles.grow, theme.typography.titleLg]}>{purchase.reference || 'Purchase'}</Text>
          <StatusBadge kind="purchase" status={purchase.status} />
        </View>
        <Text style={styles.caption}>
          {[
            supplier?.name ?? (purchase.supplier_id ? 'Supplier' : 'No supplier'),
            `Bought ${formatDate(purchase.purchased_on)}`,
            purchase.received_at ? `Received ${formatDate(purchase.received_at)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {purchase.notes ? <Text style={styles.body}>{purchase.notes}</Text> : null}
        {costed ? <Text style={styles.figure}>{`Total ${formatMoney(total)}`}</Text> : null}
      </Card>

      <Section title="Lines">
        <ListGroup>
          {items.map(item => {
            const product = productById.get(item.product_id);
            return (
              <ListRow
                key={item.id}
                title={product?.name ?? 'Product'}
                meta={[
                  locationById.get(item.location_id)?.name,
                  item.unit_cost != null ? `${formatMoney(item.unit_cost)} each` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={<Text style={styles.figure}>{formatQuantity(item.quantity, product?.unit)}</Text>}
              />
            );
          })}
        </ListGroup>
      </Section>

      {actionError ? (
        <Banner tone="danger" title="Not changed">
          {actionError}
        </Banner>
      ) : null}

      {purchase.status === 'draft' ? (
        <View style={styles.actions}>
          <Button label="Receive into stock" icon={PackageCheck} onPress={() => setConfirming('receive')} />
          <Button
            label="Edit purchase"
            icon={Pencil}
            variant="secondary"
            onPress={() => navigation.navigate(INVENTORY_ROUTES.PurchaseForm, { purchaseId })}
          />
          <Button label="Cancel purchase" icon={CircleX} variant="danger" onPress={() => setConfirming('cancel')} />
        </View>
      ) : (
        <Text style={styles.caption}>
          {purchase.status === 'received'
            ? 'Received into stock. A received purchase cannot be edited or received again.'
            : 'Cancelled. Nothing from it reached your stock.'}
        </Text>
      )}

      <ConfirmSheet
        visible={confirming === 'receive'}
        title="Receive this purchase?"
        message="Every line is added to stock at its location. This cannot be undone."
        confirmLabel="Receive into stock"
        confirmIcon={PackageCheck}
        loading={receive.isPending}
        onConfirm={onReceive}
        onClose={() => setConfirming(null)}
      />
      <ConfirmSheet
        visible={confirming === 'cancel'}
        title="Cancel this purchase?"
        message="The draft is closed and nothing is added to stock."
        confirmLabel="Cancel purchase"
        confirmIcon={CircleX}
        cancelLabel="Keep it"
        destructive
        loading={cancel.isPending}
        onConfirm={onCancel}
        onClose={() => setConfirming(null)}
      />
    </ScrollView>
  );
}
