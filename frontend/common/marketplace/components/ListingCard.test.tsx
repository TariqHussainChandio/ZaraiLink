import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ListingCard } from './ListingCard';
import type { ListingWithRelations } from '../types/marketplace';

const baseListing: ListingWithRelations = {
  id: 'l1',
  owner_id: 'u1',
  category_id: 'c1',
  title: 'DAP Fertilizer 50kg',
  description: null,
  price: 4500,
  unit: 'bag',
  quantity: 10,
  images: [],
  status: 'active',
  crop_compatibility: [],
  brand: null,
  condition: null,
  location: null,
  seller_role: 'dealer',
  inventory_product_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  category: { id: 'c1', name: 'Fertilizers', slug: 'fertilizers' },
  owner: { id: 'u1', full_name: 'AgriMart', avatar_url: null },
};

describe('ListingCard', () => {
  it('renders title, price, and category', async () => {
    await render(<ListingCard listing={baseListing} onPress={() => {}} />);
    expect(screen.getByText('DAP Fertilizer 50kg')).toBeTruthy();
    expect(screen.getByText('Rs 4,500 / bag')).toBeTruthy();
    expect(screen.getByText('Fertilizers')).toBeTruthy();
  });

  it.each([
    ['in_stock', 'In stock'],
    ['low_stock', 'Low stock'],
    ['out_of_stock', 'Out of stock'],
    ['unknown', 'Stock not known'],
  ] as const)('shows the %s stock word (A4)', async (availability, word) => {
    await render(
      <ListingCard
        listing={{ ...baseListing, availability }}
        onPress={() => {}}
      />,
    );
    expect(screen.getByText(word)).toBeTruthy();
  });

  it('shows no stock word when the API sent none (the moderation list)', async () => {
    await render(<ListingCard listing={baseListing} onPress={() => {}} />);
    expect(screen.queryByText(/stock/i)).toBeNull();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<ListingCard listing={baseListing} onPress={onPress} />);
    fireEvent.press(screen.getByText('DAP Fertilizer 50kg'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders brand and condition as chips when present', async () => {
    await render(
      <ListingCard
        listing={{ ...baseListing, brand: 'Engro', condition: 'New' }}
        onPress={() => {}}
      />,
    );
    expect(screen.getByText('Engro')).toBeTruthy();
    expect(screen.getByText('New')).toBeTruthy();
  });

  it('does not render brand/condition chips when both are absent', async () => {
    await render(<ListingCard listing={baseListing} onPress={() => {}} />);
    expect(screen.queryByText('Engro')).toBeNull();
  });
});
