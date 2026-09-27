/**
 * P7 (7D) real-stack test: the order, payment, messaging and notification hooks against the real FastAPI and the
 * real local Supabase, for three real users (seller, buyer, stranger): the allowed path and the rejected path.
 * Setup and how to run it: see src/testUtils/realStack.ts (`ZARAILINK_REALSTACK=1 npx jest realstack`).
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { API_URL, installNodeFetch, realStackEnabled, signUp } from '../../testUtils/realStack';
import { useAuthStore } from '../../store/authStore';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';

installNodeFetch();

// The token the (real) client attaches; each step says which real user is calling.
let mockToken: string | null = null;
jest.mock('../../services/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockToken ? { access_token: mockToken } : null } }),
      refreshSession: async () => ({ data: { session: null }, error: new Error('no refresh in this test') }),
      signOut: async () => ({ error: null }),
    },
    // The hooks under test never touch storage or realtime here.
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => undefined,
  },
}));

const describeReal = realStackEnabled ? describe : describe.skip;

const idOf = (token: string) => JSON.parse(atob((token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'))).sub as string;

describeReal('order, payment, messaging and notification hooks against the real backend', () => {
  let sellerToken = '';
  let buyerToken = '';
  let strangerToken = '';
  let market: typeof import('./marketplace');
  let orders: typeof import('./orders');
  let payments: typeof import('./payments');
  let messaging: typeof import('./messaging');
  let notifications: typeof import('./notifications');
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeAll(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = API_URL;
    sellerToken = await signUp('farmer');
    buyerToken = await signUp('buyer');
    strangerToken = await signUp('buyer');
    market = require('./marketplace');
    orders = require('./orders');
    payments = require('./payments');
    messaging = require('./messaging');
    notifications = require('./notifications');
  }, 60_000);

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  // Each user gets their own cache, as in the app, where the cache is emptied when the signed-in user changes.
  function signInAs(token: string) {
    mockToken = token;
    useAuthStore.setState({ user: { id: idOf(token) } as never });
    queryClient = createTestQueryClient();
  }

  afterEach(() => queryClient.clear());

  it('runs a purchase end to end: checkout, seller confirms, payment, and every other user is refused', async () => {
    // --- the seller lists something
    signInAs(sellerToken);
    const seller = await renderHook(() => market.useCreateListing(), { wrapper });
    let listing!: { id: string };
    await act(async () => {
      listing = await seller.result.current.mutateAsync({
        userId: idOf(sellerToken),
        images: [],
        input: {
          title: `Realstack order ${Date.now()}`,
          description: 'order flow',
          categoryId: null,
          price: 100,
          unit: 'kg',
          quantity: 10,
          brand: null,
          condition: null,
          cropCompatibility: [],
          country: null,
          province: null,
          city: null,
        },
      });
    });

    // --- the buyer checks out; the seller is told
    signInAs(buyerToken);
    const buyer = await renderHook(() => ({ checkout: orders.useCheckout(), list: orders.useOrders('buyer') }), { wrapper });
    let placed!: { id: string; status: string }[];
    await act(async () => {
      placed = await buyer.result.current.checkout.mutateAsync({
        items: [{ listingId: listing.id, sellerId: idOf(sellerToken), title: 't', price: 100, unit: 'kg', image: null, quantity: 2 }],
        deliveryChargeBySeller: { [idOf(sellerToken)]: 20 },
      });
    });
    const orderId = placed[0]?.id ?? '';
    expect(placed).toHaveLength(1);
    expect(placed[0]?.status).toBe('pending');
    // Checkout invalidated the buyer's order list, which refetches on its own.
    await waitFor(() => expect(buyer.result.current.list.data?.map(o => o.id)).toEqual([orderId]));

    // --- a stranger can neither read nor change it
    signInAs(strangerToken);
    const stranger = await renderHook(() => ({ detail: orders.useOrderDetail(orderId), update: orders.useUpdateOrderStatus(orderId) }), {
      wrapper,
    });
    await waitFor(() => expect(stranger.result.current.detail.error).toMatchObject({ kind: expect.stringMatching(/forbidden|notFound/) }));
    const refused = await act(async () => stranger.result.current.update.mutateAsync('cancelled').catch((e: unknown) => e));
    expect(refused).toMatchObject({ kind: expect.stringMatching(/forbidden|notFound/) });

    // --- the buyer cannot confirm their own order (seller-only transition)
    signInAs(buyerToken);
    const buyerUpdate = await renderHook(() => orders.useUpdateOrderStatus(orderId), { wrapper });
    const buyerConfirm = await act(async () => buyerUpdate.result.current.mutateAsync('confirmed').catch((e: unknown) => e));
    expect(buyerConfirm).toMatchObject({ status: 403, kind: 'forbidden' });

    // --- the seller sees the order in their list and in their notifications, and confirms it
    signInAs(sellerToken);
    const sellerView = await renderHook(
      () => ({ list: orders.useOrders('seller'), inbox: notifications.useNotifications(true), unread: notifications.useUnreadNotificationsCount(), update: orders.useUpdateOrderStatus(orderId) }),
      { wrapper },
    );
    await waitFor(() => expect(sellerView.result.current.list.data?.map(o => o.id)).toContain(orderId));
    await waitFor(() => expect(sellerView.result.current.inbox.data?.some(n => n.type === 'order_new')).toBe(true));
    await waitFor(() => expect(sellerView.result.current.unread.count).toBeGreaterThan(0));
    await act(async () => {
      await sellerView.result.current.update.mutateAsync('confirmed');
    });
    await waitFor(() => expect(sellerView.result.current.list.data?.find(o => o.id === orderId)?.status).toBe('confirmed'));

    // --- the buyer pays; the seller marks it received
    signInAs(buyerToken);
    const pay = await renderHook(() => ({ start: payments.useInitiatePayment(), context: orders.useOrderPaymentContext(orderId) }), { wrapper });
    await waitFor(() => expect(pay.result.current.context.data?.orderTotal).toBe(220));
    let payment!: { id: string; status: string };
    await act(async () => {
      payment = await pay.result.current.start.mutateAsync({ orderId, method: 'cod' });
    });
    expect(payment.status).toBe('pending');

    signInAs(buyerToken);
    const buyerResolve = await renderHook(() => payments.useResolvePayment(), { wrapper });
    const notSeller = await act(async () =>
      buyerResolve.result.current.mutateAsync({ paymentId: payment.id, action: 'received' }).catch((e: unknown) => e),
    );
    expect(notSeller).toMatchObject({ kind: expect.stringMatching(/forbidden|notFound/) });

    signInAs(sellerToken);
    const sellerResolve = await renderHook(() => ({ resolve: payments.useResolvePayment(), one: payments.usePayment(payment.id) }), { wrapper });
    await act(async () => {
      await sellerResolve.result.current.resolve.mutateAsync({ paymentId: payment.id, action: 'received' });
    });
    await waitFor(() => expect(sellerResolve.result.current.one.data?.status).toBe('successful'));
  }, 90_000);

  it('lets two users talk and keeps a stranger out of the conversation', async () => {
    signInAs(buyerToken);
    const buyer = await renderHook(() => ({ open: messaging.useOpenConversation() }), { wrapper });
    let conversation!: { id: string };
    await act(async () => {
      conversation = await buyer.result.current.open.mutateAsync(idOf(sellerToken));
    });

    const chat = await renderHook(
      () => ({ messages: messaging.useConversationMessages(conversation.id, idOf(buyerToken)), send: messaging.useSendMessage(conversation.id, idOf(buyerToken)) }),
      { wrapper },
    );
    await waitFor(() => expect(chat.result.current.messages.data).toEqual([]));
    await act(async () => {
      await chat.result.current.send.mutateAsync({ body: 'is it still available?', images: [] });
    });
    await waitFor(() => expect(chat.result.current.messages.data?.map(m => m.body)).toEqual(['is it still available?']));

    // The seller sees the same message and the conversation in their inbox.
    signInAs(sellerToken);
    const sellerChat = await renderHook(
      () => ({ messages: messaging.useConversationMessages(conversation.id, idOf(sellerToken)), inbox: messaging.useConversations(true) }),
      { wrapper },
    );
    await waitFor(() => expect(sellerChat.result.current.messages.data?.map(m => m.body)).toEqual(['is it still available?']));
    await waitFor(() => expect(sellerChat.result.current.inbox.data?.map(c => c.id)).toContain(conversation.id));

    // A stranger cannot read it.
    signInAs(strangerToken);
    const intruder = await renderHook(() => messaging.useConversationMessages(conversation.id, idOf(strangerToken)), { wrapper });
    await waitFor(() => expect(intruder.result.current.status).not.toBe('pending'));
    expect(intruder.result.current.data ?? []).toEqual([]);
  }, 60_000);
});
