import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SnackbarProvider } from '../../common/components/Snackbar';
import { MarketplaceNavigator } from './MarketplaceNavigator';
import { fetchListingById, fetchListings } from '../../common/marketplace/services/listingsService';
import { fetchReviewsForListing } from '../../common/reviews/services/reviewsService';
import { checkout } from '../../common/orders/services/ordersService';
import { initiatePayment } from '../../common/payments/services/paymentsService';
import { useAuthStore } from '../../state/authStore';
import { useCartStore } from '../../state/cartStore';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';
import type { ListingWithRelations } from '../../common/marketplace/types/marketplace';

// A full multi-screen flow through the real MarketplaceNavigator (real NavigationContainer +
// stack, real Zustand cart store) — proves Browse -> ListingDetail -> Cart -> Checkout actually
// hand off route params and cart state to each other, not just that each screen works in
// isolation with a mocked `navigation` prop.

jest.mock('../../common/marketplace/services/listingsService', () => ({
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
jest.mock('../../common/reviews/services/reviewsService', () => ({
  fetchReviewsForListing: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../common/messaging/services/messagingService', () => ({
  findOrCreateConversation: jest.fn(),
}));
jest.mock('../../common/orders/services/ordersService', () => ({
  checkout: jest.fn(),
}));
jest.mock('../../common/payments/services/paymentsService', () => ({
  initiatePayment: jest.fn(),
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
const mockInitiatePayment = initiatePayment as jest.Mock;

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
    // App.tsx mounts one SnackbarProvider; the screens' success messages need it here too.
    <SnackbarProvider>
      <QueryClientProvider client={createTestQueryClient()}>
        <NavigationContainer>
          <MarketplaceNavigator />
        </NavigationContainer>
      </QueryClientProvider>
    </SnackbarProvider>,
  );
}

beforeEach(() => {
  mockFetchListings.mockReset();
  mockFetchListingById.mockReset();
  mockFetchReviews.mockReset();
  mockCheckout.mockReset();
  mockInitiatePayment.mockReset().mockResolvedValue({ id: 'payment-1' });
  mockFetchListings.mockResolvedValue([listing]);
  mockFetchListingById.mockResolvedValue(listing);
  mockFetchReviews.mockResolvedValue([]);
  useAuthStore.setState({ user: { id: 'buyer-1' } as never, role: 'buyer' });
  useCartStore.setState({ items: [] });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Marketplace flow: browse -> listing -> cart -> checkout', () => {
  it('adds the chosen quantity from a listing to the shared cart and confirms with a snackbar', async () => {
    await renderMarketplace();

    expect(await screen.findByText('Premium Wheat Seeds')).toBeTruthy();
    expect(screen.getByLabelText('Cart')).toBeTruthy();

    await fireEvent.press(screen.getByText('Premium Wheat Seeds'));
    expect(await screen.findByRole('button', { name: 'Add to cart · Rs 250' })).toBeTruthy();
    expect(mockFetchListingById).toHaveBeenCalledWith('listing-1');

    await fireEvent.press(screen.getByRole('button', { name: 'One more kg' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add to cart · Rs 500' }));

    expect(await screen.findByText('2 × Premium Wheat Seeds added to cart')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View cart' })).toBeTruthy();
    expect(useCartStore.getState().items).toEqual([
      { listingId: 'listing-1', sellerId: 'seller-1', title: 'Premium Wheat Seeds', price: 250, unit: 'kg', image: null, quantity: 2 },
    ]);
  });

  it('goes from the snackbar to the cart, checks out with cash on delivery, and returns to Browse with the cart cleared', async () => {
    mockCheckout.mockResolvedValue([{ id: 'order-1', seller_id: 'seller-1', total: 500, status: 'pending' }]);
    await renderMarketplace();

    await fireEvent.press(await screen.findByText('Premium Wheat Seeds'));
    await fireEvent.press(await screen.findByRole('button', { name: 'One more kg' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add to cart · Rs 500' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'View cart' }));

    // Cart: one card for the seller, then on to checkout.
    expect(await screen.findByText('Green Farms')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Go to checkout' }));

    // Checkout: the way to pay is chosen here, cash chosen and bank transfer unavailable.
    expect(await screen.findByText('2 kg × Premium Wheat Seeds')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Cash on delivery/ }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole('radio', { name: /^Bank transfer/ }).props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Place order' }));

    expect(await screen.findByText('Order placed')).toBeTruthy();
    expect(mockCheckout).toHaveBeenCalledWith(
      [{ listingId: 'listing-1', sellerId: 'seller-1', title: 'Premium Wheat Seeds', price: 250, unit: 'kg', image: null, quantity: 2 }],
      { 'seller-1': 0 },
    );
    expect(mockInitiatePayment).toHaveBeenCalledWith('order-1', 'cod');
    expect(useCartStore.getState().items).toEqual([]);

    // Continue shopping pops the marketplace stack back to Browse.
    await fireEvent.press(screen.getByRole('button', { name: 'Continue shopping' }));
    expect(await screen.findByText('Premium Wheat Seeds')).toBeTruthy();
    expect(screen.getByLabelText('Cart')).toBeTruthy();
  });
});
