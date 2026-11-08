import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { ListingDetailScreen } from './ListingDetailScreen';
import { fetchListingById, recordListingView } from '../services/listingsService';
import { findOrCreateConversation } from '../../messaging/services/messagingService';
import { fetchReviewsForListing } from '../../reviews/services/reviewsService';
import { useAuthStore } from '../../../state/authStore';
import { useCartStore } from '../../../state/cartStore';
import { APP_TABS, MARKETPLACE_ROUTES, MESSAGING_ROUTES } from '../../constants/routes';
import type { ListingWithRelations } from '../types/marketplace';
import type { ReviewWithBuyer } from '../../reviews/types/reviews';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';

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

jest.mock('../services/listingsService', () => ({
  fetchListingById: jest.fn(),
  recordListingView: jest.fn(),
}));
jest.mock('../../messaging/services/messagingService', () => ({
  findOrCreateConversation: jest.fn(),
}));
jest.mock('../../reviews/services/reviewsService', () => ({
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
});

describe('ListingDetailScreen', () => {
  it('loads and renders the listing with its price plate, seller, town and reviews', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockResolvedValue(listing({ location: { country: 'Pakistan', province: 'Punjab', city: 'Sargodha' } }));
    mockFetchReviewsForListing.mockResolvedValue([review]);

    await renderWithQuery(<ListingDetailScreen {...makeProps()} />);

    expect(await screen.findByRole('header', { name: 'Wheat seeds' })).toBeTruthy();
    expect(screen.getByLabelText('Rs 100, per kg')).toBeTruthy();
    expect(screen.getByText('Certified high-yield seeds')).toBeTruthy();
    expect(screen.getByText('Green Farms')).toBeTruthy();
    expect(screen.getAllByText('Sargodha').length).toBeGreaterThan(0);
    expect(screen.getByText('Ali Khan')).toBeTruthy();
    expect(mockRecordListingView).toHaveBeenCalledWith('listing-1');
  });

  it('shows every detail that is filled in: category, brand, condition and the crops it suits (MK-08)', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockResolvedValue(listing({ brand: 'Engro', condition: 'New', crop_compatibility: ['Wheat', 'Rice'] }));
    await renderWithQuery(<ListingDetailScreen {...makeProps()} />);
    expect(await screen.findByText('Engro')).toBeTruthy();
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByText('Wheat, Rice')).toBeTruthy();
    expect(screen.getByText('Seeds')).toBeTruthy();
  });

  it('names a seller whose name is empty as "Seller"', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockResolvedValue(listing({ owner: { id: 'seller-1', full_name: '', avatar_url: null } }));
    await renderWithQuery(<ListingDetailScreen {...makeProps()} />);
    expect(await screen.findByText('Seller')).toBeTruthy();
  });

  it('does not record a view for the listing owner', async () => {
    useAuthStore.setState({ user: { id: 'seller-1' } as never });
    mockFetchListingById.mockResolvedValue(listing());

    await renderWithQuery(<ListingDetailScreen {...makeProps()} />);
    await screen.findByText('Wheat seeds');

    expect(mockRecordListingView).not.toHaveBeenCalled();
  });

  it('shows a Banner with the reason and "Try again" when loading fails, and recovers on retry (MK-03)', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockRejectedValue(new Error('Network error'));

    await renderWithQuery(<ListingDetailScreen {...makeProps()} />);
    expect(await screen.findByText("Couldn't load this listing")).toBeTruthy();

    mockFetchListingById.mockResolvedValue(listing());
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Wheat seeds')).toBeTruthy();
  });

  it('shows Edit listing in the bar for the owner, with no quantity or cart', async () => {
    useAuthStore.setState({ user: { id: 'seller-1' } as never });
    mockFetchListingById.mockResolvedValue(listing());
    const props = makeProps();

    await renderWithQuery(<ListingDetailScreen {...props} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit listing' }));

    expect(props.navigation.navigate).toHaveBeenCalledWith(MARKETPLACE_ROUTES.EditListing, { listingId: 'listing-1' });
    expect(screen.queryByText(/Add to cart/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'One more kg' })).toBeNull();
  });

  it('shows the stock word, never the listing quantity as stock (A4, SRDS §15)', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockResolvedValue(listing({ availability: 'low_stock' }));

    await renderWithQuery(<ListingDetailScreen {...makeProps()} />);

    expect(await screen.findByText('Low stock')).toBeTruthy();
    expect(screen.queryByText(/50 kg available/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to cart · Rs 100' })).toBeTruthy();
  });

  it('offers no Add to cart for an out-of-stock listing, but still lets the buyer message the seller', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockResolvedValue(listing({ availability: 'out_of_stock' }));

    await renderWithQuery(<ListingDetailScreen {...makeProps()} />);

    expect(await screen.findByText('Out of stock')).toBeTruthy();
    expect(screen.queryByText(/Add to cart/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Message seller' })).toBeTruthy();
  });

  it('sets the quantity before adding: the bar shows the total, and the cart gets that many', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockResolvedValue(listing());

    await renderWithQuery(<ListingDetailScreen {...makeProps()} />);
    await screen.findByText('Wheat seeds');
    await fireEvent.press(screen.getByRole('button', { name: 'One more kg' }));
    await fireEvent.press(screen.getByRole('button', { name: 'One more kg' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add to cart · Rs 300' }));

    expect(useCartStore.getState().items).toEqual([expect.objectContaining({ listingId: 'listing-1', sellerId: 'seller-1', quantity: 3 })]);
  });

  it('takes a typed quantity: 50 is one entry, not 49 taps (MK-02)', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockResolvedValue(listing());

    await renderWithQuery(<ListingDetailScreen {...makeProps()} />);
    await screen.findByText('Wheat seeds');
    await fireEvent.press(screen.getByRole('button', { name: '1 kg' }));
    const box = screen.getByLabelText('Number of kgs');
    await fireEvent.changeText(box, '50');
    await fireEvent(box, 'submitEditing');
    await fireEvent.press(screen.getByRole('button', { name: 'Add to cart · Rs 5,000' }));

    expect(useCartStore.getState().items[0]).toMatchObject({ quantity: 50 });
  });

  it('confirms with a snackbar that opens the cart, instead of a blocking alert (MK-15)', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockResolvedValue(listing());
    const props = makeProps();

    await renderWithQuery(<ListingDetailScreen {...props} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Add to cart · Rs 100' }));

    expect(await screen.findByText('1 × Wheat seeds added to cart')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'View cart' }));
    expect(props.navigation.navigate).toHaveBeenCalledWith(MARKETPLACE_ROUTES.Cart);
  });

  it('shows every photo in a pager ("1 of 3") and opens them full screen (MK-07)', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockResolvedValue(listing({ images: ['https://img/1.jpg', 'https://img/2.jpg', 'https://img/3.jpg'] }));

    await renderWithQuery(<ListingDetailScreen {...makeProps()} />);

    expect(await screen.findByText('1 of 3', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByRole('imagebutton', { name: 'Photo 1 of 3' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('imagebutton', { name: 'Photo 1 of 3' }));
    expect(await screen.findByRole('button', { name: 'Close photos' })).toBeTruthy();
  });

  it('shows the first three reviews and the rest on request', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockResolvedValue(listing());
    mockFetchReviewsForListing.mockResolvedValue(
      Array.from({ length: 5 }, (_, n) => ({ ...review, id: `review-${n}`, buyer: { id: `b${n}`, full_name: `Buyer ${n}`, avatar_url: null } })),
    );

    await renderWithQuery(<ListingDetailScreen {...makeProps()} />);
    expect(await screen.findByText('Buyer 2')).toBeTruthy();
    expect(screen.queryByText('Buyer 3')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Show all 5 reviews' }));
    expect(screen.getByText('Buyer 4')).toBeTruthy();
  });

  it('starts a conversation with the seller and opens Chat on top of the conversation list (MK-01)', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchListingById.mockResolvedValue(listing());
    mockFindOrCreateConversation.mockResolvedValue({ id: 'conversation-1' });

    await renderWithQuery(<ListingDetailScreen {...makeProps()} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Message seller' }));

    expect(mockFindOrCreateConversation).toHaveBeenCalledWith('seller-1');
    await waitFor(() =>
      expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Messages, {
        screen: MESSAGING_ROUTES.Chat,
        initial: false,
        params: { conversationId: 'conversation-1', otherUserName: 'Green Farms' },
      }),
    );
  });
});
