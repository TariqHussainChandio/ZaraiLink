// `type` isn't a DB enum (kept as `text` so new event types don't need a migration) — this
// union covers every event Module 13's triggers currently write; treat unknown strings as
// possible (see NotificationRow's fallback icon/label).
export type NotificationType =
  | 'order_new'
  | 'order_status_changed'
  | 'payment_status_changed'
  | 'new_message'
  | 'consultation_new'
  | 'consultation_status_changed'
  | 'listing_status_changed'
  | 'inventory_low_stock'
  | 'expert_verification_changed'
  | 'account_suspension_changed'
  // A3a: a decision on a dealer's or expert's application, or its resubmission (notify_account_status_changed).
  | 'account_status_changed';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType | (string & {});
  payload: Record<string, any>;
  read: boolean;
  created_at: string;
}
