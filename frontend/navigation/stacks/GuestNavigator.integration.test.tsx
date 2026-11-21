import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../../common/components';
import { SnackbarProvider } from '../../common/components/Snackbar';
import { useLoginNotice } from '../../common/auth';
import { fetchListingById, fetchListings } from '../../common/marketplace/services/listingsService';
import type { ListingWithRelations } from '../../common/marketplace/types/marketplace';
import { useAuthStore } from '../../state/authStore';
import { connectCartToAuth, useCartStore } from '../../state/cartStore';
import { connectCheckoutIntentToAuth, useCheckoutIntent } from '../../state/checkoutIntentStore';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';
import { RootNavigator } from './RootNavigator';

// D18 as a guest meets it, through the real RootNavigator, guest shell, marketplace stack and cart store: the market
// opens without an account, a cart can be filled, checkout asks for an account and keeps the cart, and signing in
// reopens that cart. Only the network edge is faked (the listing and review reads, which the API serves to anyone).

jest.mock('../../common/marketplace/services/listingsService', () => ({
  fetchListings: jest.fn(),
  fetchListingById: jest.fn(),
  recordListingView: jest.fn().mockResolvedValue(undefined),
  fetchCategories: jest.fn().mockResolvedValue([]),
  fetchCrops: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../common/reviews/services/reviewsService', () => ({
  fetchReviewsForListing: jest.fn().mockResolvedValue([]),
}));
jest.mock('../HomeDashboardScreen', () => ({ HomeDashboardScreen: () => null }));
jest.mock('../../admin/screens/DashboardScreen', () => ({ AdminDashboardScreen: () => null }));
jest.mock('../../hooks/realtime/useRealtimeNotifications', () => ({ useRealtimeNotifications: () => undefined }));
jest.mock('../../common/notifications/services/notificationsService', () => ({
  fetchUnreadCount: jest.fn().mockResolvedValue(0),
  fetchNotifications: jest.fn().mockResolvedValue([]),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
}));

const listing: ListingWithRelations = {
  id: 'listing-1',
  owner_id: 'seller-1',
  category_id: null,
  inventory_product_id: null,
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

const METRICS = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

let disconnect: (() => void)[] = [];

async function renderApp() {
  await render(
    <QueryClientProvider client={createTestQueryClient()}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ToastProvider>
          <SnackbarProvider>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </SnackbarProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

// Awaited: an act() left running spills into the next test, which then renders nothing.
async function signInAs(role: 'buyer' | 'admin') {
  await act(async () => {
    useAuthStore.setState({ user: { id: `user-${role}` } as never, role, status: 'authenticated' });
  });
}

/** A guest opens the app, picks a listing and puts it in the cart. */
async function guestFillsTheCart() {
  await renderApp();
  expect(await screen.findByText('Premium Wheat Seeds')).toBeTruthy();
  // D20: no bottom bar; the profile button (top left) leads to Sign up and Log in, the cart is top right.
  expect(screen.queryAllByRole('tab')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Sign up or log in' })).toBeTruthy();

  await fireEvent.press(screen.getByText('Premium Wheat Seeds'));
  await fireEvent.press(await screen.findByRole('button', { name: 'Add to cart · Rs 250' }));
  expect(useCartStore.getState().items).toHaveLength(1);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  (fetchListings as jest.Mock).mockResolvedValue([listing]);
  (fetchListingById as jest.Mock).mockResolvedValue(listing);
  useAuthStore.setState({ session: null, user: null, profile: null, role: null, status: 'unauthenticated' });
  useCartStore.setState({ items: [], ownerId: null });
  useCheckoutIntent.setState({ pending: false });
  useLoginNotice.getState().clear();
  await useCartStore.persist.rehydrate();
  disconnect = [connectCartToAuth(), connectCheckoutIntentToAuth()];
});

afterEach(() => disconnect.forEach(stop => stop()));

describe('a guest (D18)', () => {
  it('browses and fills a cart without an account, and is asked to sign in only at checkout', async () => {
    await guestFillsTheCart();

    await fireEvent.press(screen.getByLabelText(/^Cart/));
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign in to check out' }));

    // Log in, saying why; the cart and the wish to check out are kept.
    expect(await screen.findByText('Sign in to place your order')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Log in' })).toBeTruthy();
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCheckoutIntent.getState().pending).toBe(true);
  });

  it('is asked to sign in to message a seller, instead of a button that does nothing', async () => {
    await renderApp();
    await fireEvent.press(await screen.findByText('Premium Wheat Seeds'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign in to message the seller' }));
    expect(await screen.findByText('Sign in to message the seller')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Log in' })).toBeTruthy();
  });

  it('opens the welcome page from the profile button, with Sign up and Log in, and Back to the market (D20)', async () => {
    await renderApp();
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign up or log in' }));
    expect(await screen.findByRole('button', { name: 'Sign up' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('header', { name: 'Log in' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Premium Wheat Seeds')).toBeTruthy();
  });

  it('signs in and lands back on the same cart, with the market underneath', async () => {
    await guestFillsTheCart();
    await fireEvent.press(screen.getByLabelText(/^Cart/));
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign in to check out' }));

    await signInAs('buyer');
    // The buyer's own shell, on their Cart tab (D20), showing the cart the guest filled, now theirs.
    expect(await screen.findByRole('button', { name: 'Go to checkout' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Cart' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Orders' })).toBeTruthy();
    expect(useCartStore.getState()).toMatchObject({ ownerId: 'user-buyer', items: [expect.objectContaining({ listingId: 'listing-1' })] });
    expect(useCheckoutIntent.getState().pending).toBe(false);
  });

  it('names the market ZaraiLink, centred, for a guest (D20)', async () => {
    await renderApp();
    expect(await screen.findByRole('header', { name: 'ZaraiLink' })).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Market' })).toBeNull();
  });

  // D20: signing in from the welcome page used to open the admin's Account, because the guest's sign-in tab shared the
  // name Profile with the admin's Account tab and React Navigation kept the focused tab across the switch.
  it.each([
    ['admin', 'Overview'],
    // The dashboards are stubbed here, so the bar keeps the stack's title; on a device it reads the person's name.
    ['buyer', 'Home'],
  ] as const)('opens the %s dashboard after signing in from the welcome page, not the account', async (role, home) => {
    await renderApp();
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign up or log in' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('header', { name: 'Log in' })).toBeTruthy();
    await signInAs(role);
    expect(await screen.findByRole('header', { name: home })).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Account' })).toBeNull();
  });
});
