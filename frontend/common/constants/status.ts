import {
  BadgeCheck,
  ArrowLeftRight,
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
  PackagePlus,
  PackageX,
  Receipt,
  Search,
  ShoppingBag,
  SlidersHorizontal,
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
  // BR-11: ZaraiLink holds no money, so "Refunded" would read as if the platform paid it back. The enum value stays
  // `refunded`; the label says what happened: an admin settled the dispute for the buyer, and the seller refunds them
  // directly, off the platform.
  refunded: meta('neutral', Receipt, 'Settled for buyer'),
  expired: meta('neutral', Hourglass, 'Expired'),
};

// BR-11: payments go straight from buyer to seller; there is no held, escrow or release state.
const payment: Record<PaymentStatus, StatusMeta> = {
  pending: meta('warning', Clock, 'Awaiting payment'),
  processing: meta('info', LoaderCircle, 'Checking payment'),
  successful: meta('success', CircleCheck, 'Paid'),
  failed: meta('danger', TriangleAlert, 'Payment failed'),
  cancelled: meta('neutral', CircleX, 'Cancelled'),
  // BR-11: the seller returned the money to the buyer themselves; the platform never held it.
  refunded: meta('neutral', Receipt, 'Refunded by seller'),
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

// A6: a disease knowledge entry stays a draft until a qualified agronomist reviews it.
const knowledge = {
  pending_review: meta('warning', Hourglass, 'Pending agronomist review'),
  reviewed: meta('success', BadgeCheck, 'Reviewed'),
};

// B3: what happened when a marketplace dispatch reached the dealer's inventory (inventory_sync_log).
const sync = {
  applied: meta('success', CircleCheck, 'Applied'),
  skipped_duplicate: meta('neutral', CircleDashed, 'Already applied'),
  failed: meta('danger', CircleX, 'Failed'),
};

// A6: the expert's verdict on a case, kept apart from the AI assessment (SRDS §35).
const assessment = {
  agree: meta('success', Check, 'Agrees with AI'),
  correct: meta('warning', CircleAlert, 'Corrected diagnosis'),
  additional_diagnosis: meta('info', Search, 'Additional diagnosis'),
  request_information: meta('neutral', MessageCircle, 'More information needed'),
};

// B4: where a stock movement came from (SRDS §22, the movement sources of inventory_movements). Losses read neutral, not
// danger: a recorded expiry is the ledger working, not a failure.
const movement = {
  ZARAILINK_ORDER: meta('info', ShoppingBag, 'Marketplace order'),
  LOCAL_SALE: meta('info', Receipt, 'Local sale'),
  PURCHASE: meta('success', PackageCheck, 'Purchase'),
  RESTOCK: meta('success', PackagePlus, 'Restock'),
  MANUAL_ADJUSTMENT: meta('warning', SlidersHorizontal, 'Adjustment'),
  DAMAGE: meta('neutral', PackageX, 'Damage'),
  EXPIRY: meta('neutral', Hourglass, 'Expiry'),
  TRANSFER: meta('info', ArrowLeftRight, 'Transfer'),
  OTHER: meta('neutral', CircleDashed, 'Other'),
};

// B4: a purchase from a supplier; only a received one has added stock.
const purchase = {
  draft: meta('warning', Clock, 'Draft'),
  received: meta('success', PackageCheck, 'Received'),
  cancelled: meta('neutral', CircleX, 'Cancelled'),
};

// B4: SRDS §25, whether a product's ledger adds up to its current stock.
const reconciliation = {
  balanced: meta('success', Check, 'Balanced'),
  unbalanced: meta('danger', TriangleAlert, 'Does not add up'),
};

export const STATUS = {
  order,
  payment,
  application,
  consultation,
  listing,
  report,
  stock,
  knowledge,
  sync,
  assessment,
  movement,
  purchase,
  reconciliation,
} as const;

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
