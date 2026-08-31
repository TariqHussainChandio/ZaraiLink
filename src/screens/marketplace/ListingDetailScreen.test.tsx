import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ListingDetailScreen } from './ListingDetailScreen';
import { fetchListingById, recordListingView } from '../../services/modules/marketplace/listingsService';
import { findOrCreateConversation } from '../../services/modules/messaging/messagingService';
import { fetchReviewsForListing } from '../../services/modules/reviews/reviewsService';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import { APP_TABS, MARKETPLACE_ROUTES, MESSAGING_ROUTES } from '../../constants/routes';
import type { ListingWithRelations } from '../../types/marketplace';
import type { ReviewWithBuyer } from '../../types/reviews';
import type { MarketplaceScreenProps } from '../../navigation/stacks/MarketplaceNavigator';

const mockTabNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      getParent: () => ({ navigate: mockTabNavigate }),
    }),
  };
});

jest.mock('../../services/modules/marketplace/listingsService', () => ({
  fetchListingById: jest.fn(),
  recordListingView: jest.fn(),
}));
jest.mock('../../services/modules/messaging/messagingService', () => ({
  findOrCreateConversation: jest.fn(),
}));
jest.mock('../../services/modules/reviews/reviewsService', () => ({
  fetchReviewsForListing: jest.fn(),
}));

const mockFetchListingById = fetchListingById as jest.Mock;
const mockRecordListingView = recordListingView as jest.Mock;
const mockFindOrCreateConversation = findOrCreateConversation as jest.Mock;
const mockFetchReviewsForListing = fetchReviewsForListing as jest.Mock;

const listing = (overrides: Partial<ListingWithRelations> = {}): ListingWithRelations => ({
  id: 'listing-1',
  owner_id: 'seller-1',
  category_id: 'cat-1',
  title: 'Wheat seeds',
  description: 'Certified high-yield seeds',
  price: 100,
  unit: 'kg',
  quantity: 50,
  images: [],
  status: 'active',
  crop_compatibility: [],
  brand: null,
  condition: null,
  location: null,
  seller_role: 'farmer',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  category: { id: 'cat-1', name: 'Seeds', slug: 'seeds' },
  owner: { id: 'seller-1', full_name: 'Green Farms', avatar_url: null },
  ...overrides,
});

const review: ReviewWithBuyer = {
  id: 'review-1',
  order_id: 'order-1',
  consultation_id: null,
  listing_id: 'listing-1',
  seller_id: 'seller-1',
  buyer_id: 'buyer-1',
  rating: 5,
  comment: 'Great seeds',
  created_at: '2026-01-02T00:00:00.000Z',
  buyer: { id: 'buyer-1', full_name: 'Ali Khan', avatar_url: null },
};

function makeProps() {
  return {
    navigation: { navigate: jest.fn() },
    route: { params: { listingId: 'listing-1' } },
  } as unknown as MarketplaceScreenProps<'ListingDetail'>;
}

beforeEach(() => {
  mockFetchListingById.mockReset();
  mockRecordListingView.mockReset().mockResolvedValue(undefined);
  mockFindOrCreateConversation.mockReset();
  mockFetchReviewsForListing.mockReset().mockResolvedValue([]);
  mockTabNavigate.mockReset();
  useCartStore.setState({ items: [] });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ListingDetailScreen', () => {
  it('loads and renders the listing with its seller and reviews', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockResolvedValue(listing());
    mockFetchReviewsForListing.mockResolvedValue([review]);

    await render(<ListingDetailScreen {...makeProps()} />);

    expect(await screen.findByText('Wheat seeds')).toBeTruthy();
    expect(screen.getByText('Certified high-yield seeds')).toBeTruthy();
    expect(screen.getByText('Green Farms')).toBeTruthy();
    expect(screen.getByText('Ali Khan')).toBeTruthy();
    expect(mockRecordListingView).toHaveBeenCalledWith('listing-1');
  });

  it('does not record a view for the listing owner', async () => {
    useAuthStore.setState({ user: { id: 'seller-1' } as never });
    mockFetchListingById.mockResolvedValue(listing());

    await render(<ListingDetailScreen {...makeProps()} />);
    await screen.findByText('Wheat seeds');

    expect(mockRecordListingView).not.toHaveBeenCalled();
  });

  it('shows a retry state when loading fails', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockRejectedValue(new Error('Network error'));

    await render(<ListingDetailScreen {...makeProps()} />);
    expect(await screen.findByText('Listing not found')).toBeTruthy();

    mockFetchListingById.mockResolvedValue(listing());
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Wheat seeds')).toBeTruthy();
  });

  it('shows Edit Listing for the owner and navigates to EditListing', async () => {
    useAuthStore.setState({ user: { id: 'seller-1' } as never });
    mockFetchListingById.mockResolvedValue(listing());
    const props = makeProps();

    await render(<ListingDetailScreen {...props} />);
    await fireEvent.press(await screen.findByText('Edit Listing'));

    expect(props.navigation.navigate).toHaveBeenCalledWith(MARKETPLACE_ROUTES.EditListing, {
      listingId: 'listing-1',
    });
    expect(screen.queryByText('Add to Cart')).toBeNull();
  });

  it('adds the listing to the cart for a buyer', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockResolvedValue(listing());

    await render(<ListingDetailScreen {...makeProps()} />);
    await fireEvent.press(await screen.findByText('Add to Cart'));

    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ listingId: 'listing-1', sellerId: 'seller-1', quantity: 1 }),
    ]);
    expect(Alert.alert).toHaveBeenCalledWith('Added to cart', expect.stringContaining('Wheat seeds'));
  });

  it('starts a conversation with the seller and navigates to Chat', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockResolvedValue(listing());
    mockFindOrCreateConversation.mockResolvedValue({ id: 'conversation-1' });

    await render(<ListingDetailScreen {...makeProps()} />);
    await fireEvent.press(await screen.findByText('Message Seller'));

    expect(mockFindOrCreateConversation).toHaveBeenCalledWith('seller-1');
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Messages, {
      screen: MESSAGING_ROUTES.Chat,
      params: { conversationId: 'conversation-1', otherUserName: 'Green Farms' },
    });
  });
});
