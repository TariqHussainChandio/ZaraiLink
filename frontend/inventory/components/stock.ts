import { formatAmount } from '../../utils/money';
import type { InventoryItem } from '../types/dealer';

export type StockLevel = 'in_stock' | 'low_stock' | 'out_of_stock';

/** Where an item stands: nothing left is out, at or under its threshold is low (the words come from the status vocabulary). */
export function stockLevel(item: Pick<InventoryItem, 'stock_quantity' | 'min_stock_threshold'>): StockLevel {
  if (item.stock_quantity <= 0) return 'out_of_stock';
  if (item.stock_quantity <= item.min_stock_threshold) return 'low_stock';
  return 'in_stock';
}

/** An item has no name of its own yet (it takes its listing's title), so an unlinked one reads as this. */
export function itemName(item: { listing: { title: string } | null }): string {
  return item.listing?.title ?? 'Unlinked stock item';
}

/** "12 bags","1 bag", "340 kg". Short codes (kg, g) are abbreviations and never take an s. */
export function formatQuantity(quantity: number, unit: string): string {
  const word = unit.trim().toLowerCase();
  const plural = quantity === 1 || word.length <= 2 || word.endsWith('s') ? word : `${word}s`;
  return `${formatAmount(quantity)} ${plural}`;
}
