import React from 'react';
import { Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MarketplaceNavigator } from './MarketplaceNavigator';
import { fetchListingById, fetchListings } from '../../services/modules/marketplace/listingsService';
import { fetchReviewsForListing } from '../../services/modules/reviews/reviewsService';
import { checkout } from '../../services/modules/orders/ordersService';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import type { ListingWithRelations } from '../../types/marketplace';

// A full multi-screen flow through the real MarketplaceNavigator (real NavigationContainer +
// stack, real Zustand cart store) — proves Browse -> ListingDetail -> Cart -> Checkout actually
// hand off route params and cart state to each other, not just that each screen works in
// isolation with a mocked `navigation` prop.

jest.mock('../../services/modules/marketplace/listingsService', () => ({
  fetchListings: jest.fn(),
  fetchListingById: jest.fn(),
  recordListingView: jest.fn().mockResolvedValue(undefined),
  uploadListingImages: jest.fn(),
  createListing: jest.fn(),
  updateListing: jest.fn(),
  deleteListing: jest.fn(),
  fetchCategories: jest.fn().mockResolvedValue([]),
  fetchCrops: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/modules/reviews/reviewsService', () => ({
  fetchReviewsForListing: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/modules/messaging/messagingService', () => ({
  findOrCreateConversation: jest.fn(),
}));
jest.mock('../../services/modules/orders/ordersService', () => ({
  checkout: jest.fn(),
}));
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) =>
      useEffect(() => {
        effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []),
  };
});

const mockFetchListings = fetchListings as jest.Mock;
const mockFetchListingById = fetchListingById as jest.Mock;
const mockFetchReviews = fetchReviewsForListing as jest.Mock;
const mockCheckout = checkout as jest.Mock;

const listing: ListingWithRelations = {
  id: 'listing-1',
  owner_id: 'seller-1',
  category_id: null,
  title: 'Premium Wheat Seeds',
  description: 'Certified high-yield wheat seeds.',
  price: 250,
  unit: 'kg',
  quantity: 40,
  images: [],
  status: 'active',
  crop_compatibility: [],
  brand: null,
  condition: null,
  location: null,
  seller_role: 'farmer',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  category: null,
  owner: { id: 'seller-1', full_name: 'Green Farms', avatar_url: null },
};

function renderMarketplace() {
  return render(
    <NavigationContainer>
      <MarketplaceNavigator />
    </NavigationContainer>,
  );
}

beforeEach(() => {
  mockFetchListings.mockReset();
  mockFetchListingById.mockReset();
  mockFetchReviews.mockReset();
  mockCheckout.mockReset();
  mockFetchListings.mockResolvedValue([listing]);
  mockFetchListingById.mockResolvedValue(listing);
  mockFetchReviews.mockResolvedValue([]);
  useAuthStore.setState({ user: { id: 'buyer-1' } as never, role: 'buyer' });
  useCartStore.setState({ items: [] });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Marketplace flow: browse -> listing -> cart -> checkout', () => {
  it('navigates from Browse to a listing and adds it to the cart, updating the shared cart store', async () => {
    await renderMarketplace();

    expect(await screen.findByText('Premium Wheat Seeds')).toBeTruthy();
    expect(screen.getByLabelText('Cart')).toBeTruthy();

    await fireEvent.press(screen.getByText('Premium Wheat Seeds'));
    expect(await screen.findByText('Add to Cart')).toBeTruthy();
    expect(mockFetchListingById).toHaveBeenCalledWith('listing-1');

    await fireEvent.press(screen.getByText('Add to Cart'));
    expect(useCartStore.getState().items).toEqual([
      { listingId: 'listing-1', sellerId: 'seller-1', title: 'Premium Wheat Seeds', price: 250, unit: 'kg', image: null, quantity: 1 },
    ]);
    expect(Alert.alert).toHaveBeenCalledWith('Added to cart', 'Premium Wheat Seeds was added to your cart.');
  });

  it('completes checkout end to end and returns to Browse with the cart cleared', async () => {
    mockCheckout.mockResolvedValue([{ id: 'order-1' }]);
    useCartStore.setState({
      items: [
        { listingId: 'listing-1', sellerId: 'seller-1', title: 'Premium Wheat Seeds', price: 250, unit: 'kg', image: null, quantity: 2 },
      ],
    });
    await renderMarketplace();
    await screen.findByText('Premium Wheat Seeds');

    await fireEvent.press(screen.getByLabelText('Cart, 2 items'));
    await fireEvent.press(screen.getByText('Checkout'));

    expect(await screen.findByText('2 × Premium Wheat Seeds')).toBeTruthy();
    await fireEvent.press(screen.getByText('Place Order'));

    expect(mockCheckout).toHaveBeenCalledWith(
      [{ listingId: 'listing-1', sellerId: 'seller-1', title: 'Premium Wheat Seeds', price: 250, unit: 'kg', image: null, quantity: 2 }],
      { 'seller-1': 0 },
    );
    expect(useCartStore.getState().items).toEqual([]);
    expect(Alert.alert).toHaveBeenCalledWith('Order placed', expect.stringContaining('1 order'));

    // popToTop back on the marketplace stack lands back on Browse.
    expect(await screen.findByText('Premium Wheat Seeds')).toBeTruthy();
    expect(screen.getByLabelText('Cart')).toBeTruthy();
  });
});
