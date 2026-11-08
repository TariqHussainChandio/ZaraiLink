import { notificationTarget } from './notificationTargets';
import { APP_TABS, CONSULTATIONS_ROUTES, HOME_ROUTES, MARKETPLACE_ROUTES, MESSAGING_ROUTES, ORDERS_ROUTES, PROFILE_ROUTES } from '../../constants/routes';
import type { Notification } from '../types/notifications';

const notification = (type: string, payload: Record<string, unknown> = {}): Notification => ({
  id: 'n1',
  user_id: 'u1',
  type,
  payload,
  read: false,
  created_at: '2026-01-01T00:00:00.000Z',
});

function open(type: string, payload: Record<string, unknown> = {}) {
  const navigate = jest.fn();
  const tabs = { navigate } as never;
  const target = notificationTarget(notification(type, payload), tabs);
  target?.();
  return { target, navigate };
}

// Every jump is pushed over its tab's first screen (initial: false), so Back stays in that tab (FA-02, MK-01).
describe('notificationTarget', () => {
  it.each([
    ['order_new', { order_id: 'o1' }],
    ['order_status_changed', { order_id: 'o1', status: 'ready' }],
    ['payment_status_changed', { order_id: 'o1', status: 'failed' }],
  ])('opens the order for %s', (type, payload) => {
    const { navigate } = open(type, payload);
    expect(navigate).toHaveBeenCalledWith(APP_TABS.Orders, { screen: ORDERS_ROUTES.OrderDetail, params: { orderId: 'o1' }, initial: false });
  });

  it('opens the conversation for a message', () => {
    const { navigate } = open('new_message', { conversation_id: 'c1', sender_name: 'Ali Khan' });
    expect(navigate).toHaveBeenCalledWith(APP_TABS.Messages, {
      screen: MESSAGING_ROUTES.Chat,
      params: { conversationId: 'c1', otherUserName: 'Ali Khan' },
      initial: false,
    });
  });

  // FA-12: the expert's main event, and every update the farmer gets, open the case.
  it.each(['consultation_new', 'consultation_status_changed'])('opens the consultation for %s', type => {
    const { navigate } = open(type, { consultation_id: 'k1' });
    expect(navigate).toHaveBeenCalledWith(APP_TABS.Consultations, {
      screen: CONSULTATIONS_ROUTES.ConsultationDetail,
      params: { consultationId: 'k1' },
      initial: false,
    });
  });

  it('opens the listing', () => {
    const { navigate } = open('listing_status_changed', { listing_id: 'l1', status: 'sold' });
    expect(navigate).toHaveBeenCalledWith(APP_TABS.Marketplace, { screen: MARKETPLACE_ROUTES.ListingDetail, params: { listingId: 'l1' }, initial: false });
  });

  it('opens the dealer\'s inventory for low stock', () => {
    const { navigate } = open('inventory_low_stock', { stock_quantity: 3 });
    expect(navigate).toHaveBeenCalledWith(APP_TABS.Home, { screen: HOME_ROUTES.Inventory, params: undefined, initial: false });
  });

  it.each(['expert_verification_changed', 'account_status_changed', 'account_suspension_changed'])('opens the account for %s', type => {
    const { navigate } = open(type, { status: 'approved' });
    expect(navigate).toHaveBeenCalledWith(APP_TABS.Profile, { screen: PROFILE_ROUTES.ViewProfile, params: undefined, initial: false });
  });

  it.each([
    ['order_new', {}],
    ['new_message', {}],
    ['consultation_new', {}],
    ['listing_status_changed', {}],
    ['something_new', { order_id: 'o1' }],
    ['constructor', {}],
  ])('has no target for %s without what it needs', (type, payload) => {
    expect(open(type, payload).target).toBeNull();
  });
});
