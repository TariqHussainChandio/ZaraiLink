import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { APP_TABS, CONSULTATIONS_ROUTES, HOME_ROUTES, MARKETPLACE_ROUTES, MESSAGING_ROUTES, ORDERS_ROUTES, PROFILE_ROUTES } from '../../constants/routes';
import { navigateInTab } from '../../../navigation/navigateInTab';
import type { AppTabParamList } from '../../../navigation/stacks/AppNavigator';
import type { Notification } from '../types/notifications';

export type NotificationTabs = BottomTabNavigationProp<AppTabParamList> | null | undefined;

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/**
 * What a notification opens, or `null` when it has nothing to open (a type this build does not know, or a payload without
 * the id it needs). Every jump goes through `navigateInTab`, so the target is pushed on top of its tab's first screen and
 * Back stays inside that tab (audit FA-02, MK-01). The expert's tabs use the same route names as everyone's.
 */
export function notificationTarget(notification: Notification, tabs: NotificationTabs): (() => void) | null {
  const payload = notification.payload ?? {};

  switch (notification.type) {
    case 'order_new':
    case 'order_status_changed':
    case 'payment_status_changed': {
      const orderId = text(payload.order_id);
      return orderId ? () => navigateInTab(tabs, APP_TABS.Orders, ORDERS_ROUTES.OrderDetail, { orderId }) : null;
    }
    case 'new_message': {
      const conversationId = text(payload.conversation_id);
      return conversationId
        ? () => navigateInTab(tabs, APP_TABS.Messages, MESSAGING_ROUTES.Chat, { conversationId, otherUserName: text(payload.sender_name) ?? '' })
        : null;
    }
    case 'consultation_new':
    case 'consultation_status_changed': {
      const consultationId = text(payload.consultation_id);
      return consultationId
        ? () => navigateInTab(tabs, APP_TABS.Consultations, CONSULTATIONS_ROUTES.ConsultationDetail, { consultationId })
        : null;
    }
    case 'listing_status_changed': {
      const listingId = text(payload.listing_id);
      return listingId ? () => navigateInTab(tabs, APP_TABS.Marketplace, MARKETPLACE_ROUTES.ListingDetail, { listingId }) : null;
    }
    case 'inventory_low_stock':
      return () => navigateInTab(tabs, APP_TABS.Home, HOME_ROUTES.Inventory);
    case 'expert_verification_changed':
    case 'account_status_changed':
    case 'account_suspension_changed':
      return () => navigateInTab(tabs, APP_TABS.Profile, PROFILE_ROUTES.ViewProfile);
    default:
      return null;
  }
}
