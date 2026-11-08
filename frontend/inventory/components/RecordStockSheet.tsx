import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Button, ChipRow, SelectField, Sheet, TextField, useSnackbar } from '../../common/components';
import { useAdjustStock } from '../hooks/dealer';
import { useTheme, type Theme } from '../../theme';
import type { InventoryTransactionType } from '../types/dealer';
import { errorMessage } from '../../utils/errorMessage';
import { formatQuantity } from './stock';

/** What a dealer can record by hand. Marketplace dispatch is deliberately absent: the database writes it by itself when
 * an order is dispatched (SRDS §51), and offering it here would let the same order be taken off the shelf twice. */
export type RecordKind = 'in' | 'out' | 'count';

export interface RecordStockSheetProps {
  onClose: () => void;
  inventoryId: string;
  /** The item's name, for the title and the screen reader ("DAP 50 kg"). */
  itemName: string;
  unit: string;
  /** Stock now, to show it, to work out the result and to refuse an amount that would go below zero. */
  currentStock: number;
  initialKind?: RecordKind;
}

// The API keeps its six movement types (no contract change): Stock in is an `addition`, Stock out a `reduction` and a
// Count an `adjustment`, which sets the stock to the counted figure. `sale` is never sent from here.
const API_TYPE: Record<RecordKind, InventoryTransactionType> = { in: 'addition', out: 'reduction', count: 'adjustment' };

const KIND_OPTIONS: { value: RecordKind; label: string }[] = [
  { value: 'in', label: 'Stock in' },
  { value: 'out', label: 'Stock out' },
  { value: 'count', label: 'Count' },
];

const REASONS: Record<'in' | 'out', { id: string; label: string }[]> = {
  in: [
    { id: 'Bought from a supplier', label: 'Bought from a supplier' },
    { id: 'Returned', label: 'Returned' },
    { id: 'Other', label: 'Other' },
  ],
  out: [
    { id: 'Shop sale', label: 'Shop sale' },
    { id: 'Damaged', label: 'Damaged' },
    { id: 'Expired', label: 'Expired' },
    { id: 'Own use', label: 'Own use' },
  ],
};

// The reason a fresh Stock in or Stock out starts on: the commonest one.
const DEFAULT_REASON: Record<'in' | 'out', string> = { in: 'Bought from a supplier', out: 'Shop sale' };

const WHOLE_NUMBER = /^\d+$/;

/** Records one stock movement by hand: three plain choices (Stock in, Stock out, Count), the stock now and the stock after,
 * and a button that names the result. Whole numbers only; a quantity that would take stock below zero is refused here,
 * before the server is asked. */
export function RecordStockSheet({ onClose, inventoryId, itemName, unit, currentStock, initialKind = 'in' }: RecordStockSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const snackbar = useSnackbar();
  const adjust = useAdjustStock(inventoryId);
  const [kind, setKind] = useState<RecordKind>(initialKind);
  const [reason, setReason] = useState<string>(initialKind === 'out' ? DEFAULT_REASON.out : DEFAULT_REASON.in);
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [failure, setFailure] = useState<unknown>(null);

  const changeKind = (next: RecordKind) => {
    setKind(next);
    setFailure(null);
    if (next !== 'count') setReason(DEFAULT_REASON[next]);
  };

  const typed = quantity.trim();
  const isWhole = WHOLE_NUMBER.test(typed);
  const amount = isWhole ? Number(typed) : null;
  // A stock in or out of nothing records nothing; a count of zero is a real answer ("the shelf is empty").
  const usable = amount !== null && (kind === 'count' || amount > 0);
  const result = amount === null ? null : kind === 'in' ? currentStock + amount : kind === 'out' ? currentStock - amount : amount;

  let quantityError: string | undefined;
  if (typed !== '' && !isWhole) quantityError = 'Enter a whole number, like 5';
  else if (usable && result !== null && result < 0) quantityError = `Only ${formatQuantity(currentStock, unit)} in stock`;
  else if (typed !== '' && amount === 0 && kind !== 'count') quantityError = 'Enter more than zero';

  const noteMissing = kind === 'count' && note.trim() === '';
  const ready = usable && result !== null && result >= 0 && !noteMissing;

  const buttonLabel =
    !usable || amount === null
      ? 'Record stock'
      : kind === 'in'
        ? `Add ${formatQuantity(amount, unit)}`
        : kind === 'out'
          ? `Remove ${formatQuantity(amount, unit)}`
          : `Set stock to ${formatQuantity(amount, unit)}`;

  const submit = async () => {
    if (!ready || amount === null || result === null) return;
    setFailure(null);
    const extra = note.trim();
    const notes = kind === 'count' ? extra : extra ? `${reason}: ${extra}` : reason;
    try {
      await adjust.mutateAsync({ type: API_TYPE[kind], quantity: amount, notes });
      const now = formatQuantity(result, unit);
      snackbar.show(
        kind === 'in'
          ? `Added ${formatQuantity(amount, unit)}. Now ${now}.`
          : kind === 'out'
            ? `Removed ${formatQuantity(amount, unit)}. Now ${now}.`
            : `Stock counted. Now ${now}.`,
      );
      onClose();
    } catch (error) {
      setFailure(error);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={`Record stock · ${itemName}`}
      footer={<Button label={buttonLabel} size="lg" disabled={!ready} loading={adjust.isPending} onPress={submit} />}
    >
      <View style={styles.body}>
        <View style={styles.now} accessible accessibilityLabel={`In stock now: ${formatQuantity(currentStock, unit)}`}>
          <Text style={styles.nowLabel}>In stock now</Text>
          <Text style={styles.nowFigure}>{formatQuantity(currentStock, unit)}</Text>
        </View>

        <ChipRow options={KIND_OPTIONS} value={kind} onChange={changeKind} wrap />

        {kind !== 'count' ? (
          <SelectField
            label={kind === 'in' ? 'Why is stock coming in' : 'Why is stock going out'}
            value={reason}
            options={REASONS[kind]}
            onSelect={setReason}
            searchable={false}
          />
        ) : null}

        <TextField
          label={kind === 'count' ? 'Counted quantity' : 'Quantity'}
          numeric
          keyboardType="number-pad"
          suffix={unit}
          helper={kind === 'count' ? 'What is on the shelf now. Whole numbers only.' : 'Whole numbers only'}
          value={quantity}
          onChangeText={text => {
            setQuantity(text);
            setFailure(null);
          }}
          error={quantityError}
        />

        {ready && result !== null ? <Banner tone="info">{`After this: ${formatQuantity(result, unit)}`}</Banner> : null}

        <TextField
          label="Note"
          optional={kind !== 'count'}
          helper={kind === 'count' ? 'Required: say how you counted, for example "Shelf count".' : undefined}
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={2}
        />

        {failure ? (
          <Banner tone="danger" title="Couldn't record this">
            {errorMessage(failure)}
          </Banner>
        ) : null}
      </View>
    </Sheet>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    body: { gap: space[2] },
    now: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space[2] },
    nowLabel: { ...typography.body, color: colors.ink2 },
    nowFigure: { ...typography.figureLg, color: colors.ink },
  });
}
