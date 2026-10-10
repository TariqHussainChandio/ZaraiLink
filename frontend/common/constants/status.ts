import {
  BadgeCheck,
  Ban,
  Check,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleQuestionMark,
  CircleX,
  Clock,
  Gavel,
  Hourglass,
  LoaderCircle,
  Lock,
  MessageCircle,
  PackageCheck,
  Receipt,
  Search,
  Tag,
  TriangleAlert,
  Truck,
  type LucideIcon,
} from 'lucide-react-native';
import type { ReportStatus } from '../../admin';
import type { ConsultationStatus, VerificationStatus } from '../../expert';
import type { ToneKey } from '../../theme';
import type { ListingStatus } from '../marketplace';
import type { OrderStatus } from '../orders';
import type { PaymentStatus } from '../payments';

// The status vocabulary (A2, D14; the design system's "Status vocabulary"): every status the app shows maps to one tone,
// one icon and one label, so the same state reads the same on every screen. Status is never colour alone: StatusBadge
// always draws the icon and the word. Tones: warning = waiting on someone, info = in flight, success = settled well,
// neutral = ended or unknown, danger = stopped or failed (the only solid badge).
interface StatusMeta {
  tone: ToneKey;
  icon: LucideIcon;
  label: string;
}

const meta = (tone: ToneKey, icon: LucideIcon, label: string): StatusMeta => ({ tone, icon, label });

const order: Record<OrderStatus, StatusMeta> = {
  pending: meta('warning', Clock, 'Pending'),
  confirmed: meta('info', Check, 'Confirmed'),
  processing: meta('info', LoaderCircle, 'Processing'),
  ready: meta('info', PackageCheck, 'Ready for dispatch'),
  // D5 (A4): the goods have left the seller, and so has the stock. The buyer collects or receives them by whatever
  // arrangement the two made; ZaraiLink tracks no delivery (BR-10).
  dispatched: meta('info', Truck, 'Dispatched'),
  completed: meta('success', CircleCheck, 'Completed'),
  cancelled: meta('neutral', CircleX, 'Cancelled'),
  rejected: meta('danger', Ban, 'Rejected'),
  payment_failed: meta('danger', TriangleAlert, 'Payment failed'),
  disputed: meta('warning', Gavel, 'Disputed'),
  // BR-11: a refund is the seller returning money directly; ZaraiLink never held it.
  refunded: meta('neutral', Receipt, 'Refunded'),
  expired: meta('neutral', Hourglass, 'Expired'),
};

// BR-11: payments go straight from buyer to seller; there is no held, escrow or release state.
const payment: Record<PaymentStatus, StatusMeta> = {
  pending: meta('warning', Clock, 'Awaiting payment'),
  processing: meta('info', LoaderCircle, 'Checking payment'),
  successful: meta('success', CircleCheck, 'Paid'),
  failed: meta('danger', TriangleAlert, 'Payment failed'),
  cancelled: meta('neutral', CircleX, 'Cancelled'),
  refunded: meta('neutral', Receipt, 'Refunded'),
};

// SRDS §13: dealer and expert applications.
const application: Record<VerificationStatus, StatusMeta> = {
  pending: meta('warning', Hourglass, 'Under review'),
  approved: meta('success', BadgeCheck, 'Approved'),
  rejected: meta('danger', CircleX, 'Not approved'),
  suspended: meta('neutral', Lock, 'Suspended'),
};

const consultation: Record<ConsultationStatus, StatusMeta> = {
  requested: meta('warning', Clock, 'Requested'),
  accepted: meta('info', Check, 'Accepted'),
  in_progress: meta('info', MessageCircle, 'In progress'),
  resolved: meta('success', CircleCheck, 'Resolved'),
  closed: meta('neutral', Lock, 'Closed'),
  rejected: meta('danger', Ban, 'Declined'),
  cancelled: meta('neutral', CircleX, 'Cancelled'),
  expired: meta('neutral', Hourglass, 'Expired'),
};

const listing: Record<ListingStatus, StatusMeta> = {
  active: meta('success', Check, 'Listed'),
  inactive: meta('neutral', CirclePause, 'Hidden'),
  sold: meta('neutral', Tag, 'Sold'),
};

const report: Record<ReportStatus, StatusMeta> = {
  open: meta('warning', CircleAlert, 'Open'),
  investigating: meta('info', Search, 'Investigating'),
  resolved: meta('success', CircleCheck, 'Resolved'),
  dismissed: meta('neutral', CircleX, 'Dismissed'),
};

// Stock as the dealer sees it; "Stock not known" is what a buyer sees when the inventory system does not answer.
const stock = {
  in_stock: meta('success', Check, 'In stock'),
  low_stock: meta('warning', TriangleAlert, 'Low stock'),
  out_of_stock: meta('danger', Ban, 'Out of stock'),
  unknown: meta('neutral', CircleQuestionMark, 'Stock not known'),
};

export const STATUS = { order, payment, application, consultation, listing, report, stock } as const;

export type StatusKind = keyof typeof STATUS;
export type StatusOf<K extends StatusKind> = keyof (typeof STATUS)[K];

/** A status's tone, icon and word. Read statuses through this, never by indexing STATUS: an installed build meets API
 * values it does not know yet (a status added after it was built), and an unknown one must read as a neutral word, not crash
 * the screen that shows it. */
export function statusMeta<K extends StatusKind>(kind: K, status: StatusOf<K> | string): StatusMeta {
  const table: Partial<Record<string, StatusMeta>> = STATUS[kind];
  const key = String(status);
  // Own keys only: a value such as "constructor" must not pick up something the object inherits.
  const known = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
  return known ?? meta('neutral', CircleDashed, sentenceCase(key));
}

function sentenceCase(value: string): string {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
