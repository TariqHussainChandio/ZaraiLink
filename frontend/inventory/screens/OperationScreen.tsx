import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ScrollView, Text, View } from 'react-native';
import { z } from 'zod';
import {
  Banner,
  Button,
  Chip,
  ChipRow,
  SelectField,
  TextField,
  useToast,
} from '../../common/components';
import { hapticSuccess } from '../../utils/haptics';
import { useTheme } from '../../theme';
import { formatQuantity } from '../components/format';
import {
  cappedText,
  positiveNumber,
  TEXT_LIMITS,
} from '../components/formValues';
import { makeScreenStyles } from '../components/screenStyles';
import { QuantityStepper } from '../components/QuantityStepper';
import { useEntryKey } from '../hooks/entryKey';
import { writeErrorMessage, writeErrorTitle } from '../hooks/errors';
import {
  useAdjustment,
  useProduct,
  useProducts,
  useStockIn,
  useStockOut,
  useTransfer,
} from '../hooks/inventory';
import { useSelectedLocation } from '../hooks/location';
import type { StockOperation } from '../types/inventory';
import {
  INVENTORY_ROUTES,
  type InventoryScreenProps,
} from '../types/navigation';

/** Why stock left, as the dealer thinks of it. Own use is recorded as OTHER with the words "Own use" (SRDS §22). */
type OutReason = 'LOCAL_SALE' | 'DAMAGE' | 'EXPIRY' | 'OWN_USE' | 'OTHER';

const OUT_REASONS: { value: OutReason; label: string }[] = [
  { value: 'LOCAL_SALE', label: 'Local sale' },
  { value: 'DAMAGE', label: 'Damage' },
  { value: 'EXPIRY', label: 'Expiry' },
  { value: 'OWN_USE', label: 'Own use' },
  { value: 'OTHER', label: 'Other' },
];

const DIRECTIONS: { value: 'in' | 'out'; label: string }[] = [
  { value: 'in', label: 'Add to stock' },
  { value: 'out', label: 'Take from stock' },
];

export const OPERATION_TITLES: Record<StockOperation, string> = {
  in: 'Stock in',
  out: 'Stock out',
  adjust: 'Adjustment',
  transfer: 'Transfer',
};

const DESCRIPTIONS: Record<StockOperation, string> = {
  in: 'New stock arriving by hand: a restock not bought through a recorded purchase.',
  out: 'Stock leaving outside the marketplace: a sale in your shop, damage, expiry or your own use.',
  adjust:
    'A correction after a count. Say why: the reason is kept with the change.',
  transfer:
    'Move stock from one of your locations to another. The total does not change.',
};

function makeSchema(operation: StockOperation) {
  return z
    .object({
      productId: z.string().min(1, 'Choose a product'),
      locationId: z.string().min(1, 'Choose a location'),
      toLocationId: z.string(),
      quantity: positiveNumber,
      outReason: z.enum(['LOCAL_SALE', 'DAMAGE', 'EXPIRY', 'OWN_USE', 'OTHER']),
      direction: z.enum(['in', 'out']),
      reason: cappedText(TEXT_LIMITS.text),
    })
    .superRefine((values, ctx) => {
      if (operation === 'adjust' && values.reason.trim() === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['reason'],
          message: 'Say why the stock is being corrected',
        });
      }
      if (operation === 'transfer') {
        if (!values.toLocationId)
          ctx.addIssue({
            code: 'custom',
            path: ['toLocationId'],
            message: 'Choose where it goes',
          });
        else if (values.toLocationId === values.locationId) {
          ctx.addIssue({
            code: 'custom',
            path: ['toLocationId'],
            message: 'Choose a different location',
          });
        }
      }
    });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

/** One form for each stock operation. The server applies it in one transaction with one ledger line (two for a
 * transfer) and refuses a quantity that would take a location below zero; that refusal is shown here, as sent. */
export function OperationScreen({
  route,
  navigation,
}: InventoryScreenProps<typeof INVENTORY_ROUTES.Operation>) {
  const theme = useTheme();
  const styles = useMemo(() => makeScreenStyles(theme), [theme]);
  const { operation, productId: initialProductId } = route.params;
  const { location, locations } = useSelectedLocation();
  const products = useProducts();
  const schema = useMemo(() => makeSchema(operation), [operation]);
  // One Idempotency-Key for this entry, kept through retries and edits until a confirmed save (F2).
  const { key, renew } = useEntryKey();
  const stockIn = useStockIn();
  const stockOut = useStockOut();
  const adjustment = useAdjustment();
  const transfer = useTransfer();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      productId: initialProductId ?? '',
      locationId: location?.id ?? '',
      toLocationId: '',
      quantity: '',
      outReason: 'LOCAL_SALE',
      direction: 'in',
      reason: '',
    },
  });

  // The locations load after the form when the cache is cold: start from the app bar's location once it is known.
  useEffect(() => {
    if (location && !getValues('locationId'))
      setValue('locationId', location.id);
  }, [location, getValues, setValue]);

  const productId = useWatch({ control, name: 'productId' });
  const locationId = useWatch({ control, name: 'locationId' });
  const product = useProduct(productId || undefined);
  const available =
    product.data?.stock?.find(level => level.location_id === locationId)
      ?.quantity ?? 0;
  const unit = product.data?.unit;

  const productOptions = useMemo(
    () =>
      (products.data ?? [])
        .filter(item => item.is_active || item.id === initialProductId)
        .map(item => ({ id: item.id, label: `${item.name} (${item.sku})` })),
    [products.data, initialProductId],
  );
  const locationOptions = useMemo(
    () => locations.map(item => ({ id: item.id, label: item.name })),
    [locations],
  );

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const quantity = Number(values.quantity);
    const reason = values.reason.trim() || null;
    try {
      if (operation === 'in') {
        await stockIn.mutateAsync({
          key,
          input: {
            product_id: values.productId,
            location_id: values.locationId,
            quantity,
            reason,
          },
        });
      } else if (operation === 'out') {
        const ownUse = values.outReason === 'OWN_USE';
        await stockOut.mutateAsync({
          key,
          input: {
            product_id: values.productId,
            location_id: values.locationId,
            quantity,
            source: values.outReason === 'OWN_USE' ? 'OTHER' : values.outReason,
            reason: ownUse
              ? reason
                ? `Own use: ${reason}`
                : 'Own use'
              : reason,
          },
        });
      } else if (operation === 'adjust') {
        await adjustment.mutateAsync({
          key,
          input: {
            product_id: values.productId,
            location_id: values.locationId,
            quantity,
            direction: values.direction,
            reason: values.reason.trim(),
          },
        });
      } else {
        await transfer.mutateAsync({
          key,
          input: {
            product_id: values.productId,
            from_location_id: values.locationId,
            to_location_id: values.toLocationId,
            quantity,
            reason,
          },
        });
      }
      renew();
      hapticSuccess();
      toast.success(`${OPERATION_TITLES[operation]} saved`);
      navigation.goBack();
    } catch (err) {
      setServerError(writeErrorMessage(err));
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.body}>{DESCRIPTIONS[operation]}</Text>

      <Controller
        control={control}
        name="productId"
        render={({ field: { onChange, value } }) => (
          <SelectField
            label="Product"
            placeholder="Choose a product"
            value={value || null}
            options={productOptions}
            onSelect={onChange}
            loading={products.isPending}
            error={errors.productId?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="locationId"
        render={({ field: { onChange, value } }) => (
          <SelectField
            label={operation === 'transfer' ? 'From location' : 'Location'}
            value={value || null}
            options={locationOptions}
            onSelect={onChange}
            searchable={false}
            error={errors.locationId?.message}
          />
        )}
      />

      {operation === 'transfer' ? (
        <Controller
          control={control}
          name="toLocationId"
          render={({ field: { onChange, value } }) => (
            <SelectField
              label="To location"
              placeholder="Choose where it goes"
              value={value || null}
              options={locationOptions.filter(
                option => option.id !== locationId,
              )}
              onSelect={onChange}
              searchable={false}
              error={errors.toLocationId?.message}
            />
          )}
        />
      ) : null}

      {productId && locationId ? (
        <Text
          style={styles.caption}
        >{`In stock here: ${formatQuantity(available, unit)}`}</Text>
      ) : null}

      {operation === 'out' ? (
        <View style={styles.actions}>
          <Text style={styles.overline}>Why it left</Text>
          <Controller
            control={control}
            name="outReason"
            // Five reasons do not fit one row on a phone; a scrolling row hid "Own use" at the edge and "Other" off screen
            // (B4 verification F8), so they wrap.
            render={({ field: { onChange, value } }) => (
              <View style={styles.wrap}>
                {OUT_REASONS.map(option => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={option.value === value}
                    onPress={() => onChange(option.value)}
                  />
                ))}
              </View>
            )}
          />
        </View>
      ) : null}

      {operation === 'adjust' ? (
        <View style={styles.actions}>
          <Text style={styles.overline}>Direction</Text>
          <Controller
            control={control}
            name="direction"
            render={({ field: { onChange, value } }) => (
              <ChipRow options={DIRECTIONS} value={value} onChange={onChange} />
            )}
          />
        </View>
      ) : null}

      <Controller
        control={control}
        name="quantity"
        render={({ field: { onChange, value } }) => (
          <QuantityStepper
            label="Quantity"
            value={value}
            onChange={onChange}
            unit={unit}
            error={errors.quantity?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="reason"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label={operation === 'adjust' ? 'Reason' : 'Note'}
            optional={operation !== 'adjust'}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            multiline
            error={errors.reason?.message}
          />
        )}
      />

      {serverError ? (
        <Banner tone="danger" title={writeErrorTitle(serverError)}>
          {serverError}
        </Banner>
      ) : null}

      <Button
        label={`Save ${OPERATION_TITLES[operation].toLowerCase()}`}
        loading={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      />
    </ScrollView>
  );
}
