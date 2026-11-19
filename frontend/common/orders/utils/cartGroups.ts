import type { ListingWithRelations } from '../../marketplace';
import type { CartItem } from '../../../state/cartStore';

/** One seller's part of the cart: checkout makes one order per seller, so the cart and the checkout both group this way. */
export interface SellerGroup {
  sellerId: string;
  items: CartItem[];
}

/** The cart split by seller, in the order sellers first appear. */
export function groupBySeller(items: CartItem[]): SellerGroup[] {
  const groups = new Map<string, CartItem[]>();
  for (const item of items) {
    const group = groups.get(item.sellerId) ?? [];
    group.push(item);
    groups.set(item.sellerId, group);
  }
  return Array.from(groups, ([sellerId, sellerItems]) => ({ sellerId, items: sellerItems }));
}

/** The current copies of the cart's listings, by listing id. A listing that could not be loaded is simply absent. */
export type CartListings = Map<string, ListingWithRelations>;

/** The price per unit the server will charge: the listing's current price, or the one saved with the item when the listing
 * could not be loaded (offline). */
export function currentPrice(item: CartItem, listings: CartListings): number {
  return listings.get(item.listingId)?.price ?? item.price;
}

export function productsTotal(items: CartItem[], listings: CartListings): number {
  return items.reduce((sum, item) => sum + currentPrice(item, listings) * item.quantity, 0);
}

/** The seller's name and town for a card title, from whichever of their listings loaded. "Seller" when none did. */
export function sellerLabel(group: SellerGroup, listings: CartListings): { name: string; city: string | null } {
  for (const item of group.items) {
    const listing = listings.get(item.listingId);
    if (listing?.owner?.full_name) return { name: listing.owner.full_name, city: listing.location?.city ?? null };
  }
  return { name: 'Seller', city: null };
}
