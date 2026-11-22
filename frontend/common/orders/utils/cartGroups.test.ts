import type { CartItem } from '../../../state/cartStore';
import type { ListingWithRelations } from '../../marketplace';
import { currentPrice, groupBySeller, productsTotal, sellerLabel, type CartListings } from './cartGroups';

const item = (overrides: Partial<CartItem>): CartItem => ({
  listingId: 'l1',
  sellerId: 's1',
  title: 'Wheat seeds',
  price: 100,
  unit: 'kg',
  image: null,
  quantity: 2,
  ...overrides,
});

const listing = (price: number, name: string | null, city: string | null) =>
  ({ price, owner: name ? { id: 's', full_name: name, avatar_url: null } : null, location: city ? { country: null, province: null, city } : null }) as ListingWithRelations;

describe('groupBySeller', () => {
  it('splits the cart by seller in the order sellers first appear', () => {
    const groups = groupBySeller([item({ listingId: 'a', sellerId: 's2' }), item({ listingId: 'b', sellerId: 's1' }), item({ listingId: 'c', sellerId: 's2' })]);
    expect(groups.map(group => [group.sellerId, group.items.map(i => i.listingId)])).toEqual([
      ['s2', ['a', 'c']],
      ['s1', ['b']],
    ]);
  });
});

describe('prices', () => {
  const listings: CartListings = new Map([['l1', listing(120, 'Chaudhry Seeds', 'Sargodha')]]);

  it("uses today's price when the listing loaded, and the saved one when it did not", () => {
    expect(currentPrice(item({}), listings)).toBe(120);
    expect(currentPrice(item({ listingId: 'other' }), listings)).toBe(100);
  });

  it('sums products at those prices', () => {
    expect(productsTotal([item({ quantity: 2 }), item({ listingId: 'other', quantity: 3 })], listings)).toBe(240 + 300);
  });
});

describe('sellerLabel', () => {
  it('names the seller and town from whichever listing loaded', () => {
    const listings: CartListings = new Map([['b', listing(1, 'Nadia Batool', 'Okara')]]);
    const group = { sellerId: 's1', items: [item({ listingId: 'a' }), item({ listingId: 'b' })] };
    expect(sellerLabel(group, listings)).toEqual({ name: 'Nadia Batool', city: 'Okara' });
  });

  it('says "Seller" when nothing loaded', () => {
    expect(sellerLabel({ sellerId: 's1', items: [item({})] }, new Map())).toEqual({ name: 'Seller', city: null });
  });
});
