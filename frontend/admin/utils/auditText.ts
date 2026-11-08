import { ROLE_LABELS, type Role } from '../../common/constants/roles';
import { statusMeta, type StatusKind } from '../../common/constants/status';
import type { AuditLogEntryWithActor } from '../types/audit';

/** The audit log in plain words (AD-07, SRDS §51): "Sana approved a dealer application", not `dealer_application_approved`,
 * and "Listed → Hidden" from the old and new state, not JSON. The API sends no name for the item acted on (only its table
 * and id), so a sentence names the kind of item and the detail sheet shows its short id. */

interface AuditChange {
  label: string;
  /** Null when the entry records only the new value (a creation, or a patch). */
  from: string | null;
  to: string;
}

export interface AuditDescription {
  sentence: string;
  /** What the item is, for the detail sheet: "Account", "Listing". */
  item: string;
  changes: AuditChange[];
  reason: string | null;
}

/** The areas the log is filtered by (a person thinks in "Listings", not in table names). `entity` is the one table the API
 * can filter on; an area with several tables, or one table split by action, is matched in the app. */
export interface AuditArea {
  value: string;
  label: string;
  entity?: string;
  match?: (entry: AuditLogEntryWithActor) => boolean;
}

const isApplication = (entry: AuditLogEntryWithActor) => /_application_(approved|rejected)$/.test(entry.action);

export const AUDIT_AREAS: AuditArea[] = [
  { value: 'all', label: 'All' },
  { value: 'applications', label: 'Applications', entity: 'profiles', match: isApplication },
  {
    value: 'accounts',
    label: 'Accounts',
    match: e => (e.target_entity === 'profiles' && !isApplication(e)) || e.target_entity === 'auth.users',
  },
  { value: 'listings', label: 'Listings', entity: 'listings' },
  { value: 'reports', label: 'Reports', entity: 'reports' },
  { value: 'orders', label: 'Orders', entity: 'order' },
  { value: 'content', label: 'Reviews and messages', match: e => e.target_entity === 'reviews' || e.target_entity === 'messages' },
  {
    value: 'settings',
    label: 'Settings',
    match: e => ['categories', 'required_documents', 'units', 'currencies'].includes(e.target_entity) || /_reference_data$/.test(e.action),
  },
];

const ITEM_LABEL: Record<string, string> = {
  profiles: 'Account',
  'auth.users': 'Admin sign-in',
  listings: 'Listing',
  reports: 'Report',
  order: 'Order',
  orders: 'Order',
  reviews: 'Review',
  messages: 'Message',
  categories: 'Category',
  required_documents: 'Required document',
  units: 'Unit',
  currencies: 'Currency',
};

const FIELD_LABEL: Record<string, string> = {
  role: 'Role',
  account_status: 'Application',
  is_suspended: 'Account',
  status: 'Status',
  name: 'Name',
  label: 'Name',
  email: 'Email',
  description: 'Description',
  is_required: 'Needed',
  active: 'In use',
  code: 'Code',
  symbol: 'Symbol',
  applies_to: 'Used for',
};

// Not worth a line: the item's own id, bookkeeping, and fields a person never typed or that the sentence already carries.
const HIDDEN_FIELDS = new Set(['id', 'created_at', 'updated_at', 'account_status_reason', 'sort_order', 'slug', 'icon']);

const sentenceCase = (value: string) => {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const STATUS_KIND_BY_ENTITY: Record<string, StatusKind> = { listings: 'listing', reports: 'report', order: 'order' };

function formatValue(entity: string, key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'None';
  if (key === 'role' && typeof value === 'string' && value in ROLE_LABELS) return ROLE_LABELS[value as Role];
  if (key === 'account_status') return statusMeta('application', String(value)).label;
  if (key === 'is_suspended') return value ? 'Suspended' : 'Active';
  if (key === 'active') return value ? 'Yes' : 'No';
  if (key === 'is_required') return value ? 'Required' : 'Optional';
  if (key === 'status') {
    const kind = STATUS_KIND_BY_ENTITY[entity];
    return kind ? statusMeta(kind, String(value)).label : sentenceCase(String(value));
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function changesOf(entry: AuditLogEntryWithActor): AuditChange[] {
  const before = entry.previous_state ?? null;
  const after = entry.new_state ?? null;
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])).filter(k => !HIDDEN_FIELDS.has(k));
  const changes: AuditChange[] = [];
  for (const key of keys) {
    const was = before ? before[key] : undefined;
    const now = after ? after[key] : undefined;
    // With both states recorded, only what differs is a change; with one, everything it holds is.
    if (before && after && JSON.stringify(was) === JSON.stringify(now)) continue;
    if (!after && before) continue;
    changes.push({
      label: FIELD_LABEL[key] ?? sentenceCase(key),
      from: before && key in before ? formatValue(entry.target_entity, key, was) : null,
      to: formatValue(entry.target_entity, key, now),
    });
  }
  return changes;
}

function reasonOf(entry: AuditLogEntryWithActor): string | null {
  const meta = entry.metadata ?? {};
  for (const key of ['reason', 'notes']) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const fromState = entry.new_state?.account_status_reason;
  return typeof fromState === 'string' && fromState.trim() ? fromState.trim() : null;
}

function verbPhrase(entry: AuditLogEntryWithActor): string {
  const application = /^(dealer|expert)_application_(approved|rejected)$/.exec(entry.action);
  if (application) return `${application[2] === 'approved' ? 'approved' : 'rejected'} ${application[1] === 'expert' ? 'an' : 'a'} ${application[1]} application`;
  const named = (typeof entry.new_state?.name === 'string' && entry.new_state.name) || (typeof entry.new_state?.label === 'string' && entry.new_state.label) || null;
  switch (entry.action) {
    case 'suspend_user':
      return 'suspended an account';
    case 'reactivate_user':
      return 'lifted the suspension on an account';
    case 'change_role':
      return "changed an account's role";
    case 'resolve_report':
      return 'resolved a report';
    case 'dismiss_report':
      return 'dismissed a report';
    case 'update_listing_status': {
      const status = entry.new_state?.status;
      return status === 'inactive' ? 'hid a listing' : status === 'active' ? 'restored a listing' : 'changed a listing';
    }
    case 'create_category':
      return named ? `added the category "${named}"` : 'added a category';
    case 'update_category':
      return named ? `renamed a category to "${named}"` : 'changed a category';
    case 'delete_category':
      return 'deleted a category';
    case 'redact_message':
      return 'removed a message';
    case 'delete_review':
      return 'deleted a review';
    case 'resolve_order_dispute':
      return 'decided an order dispute';
    case 'create_reference_data':
      return `added an entry to the ${entry.target_entity} list`;
    case 'update_reference_data':
      return `changed an entry in the ${entry.target_entity} list`;
    case 'delete_reference_data':
      return `deleted an entry from the ${entry.target_entity} list`;
    case 'required_document_created':
      return named ? `added the required document "${named}"` : 'added a required document';
    case 'required_document_updated':
      return named ? `changed the required document "${named}"` : 'changed a required document';
    case 'admin_email_changed':
      return 'changed their sign-in email';
    case 'account_self_deleted':
      return 'deleted their own account';
    default:
      return sentenceCase(entry.action).toLowerCase();
  }
}

export function describeAudit(entry: AuditLogEntryWithActor): AuditDescription {
  const who = entry.actor?.full_name || 'The system';
  return {
    sentence: `${who} ${verbPhrase(entry)}`,
    item: ITEM_LABEL[entry.target_entity] ?? sentenceCase(entry.target_entity),
    changes: changesOf(entry),
    reason: reasonOf(entry),
  };
}

/** "Under review → Approved" for a single recorded change, for the line under a row's sentence. */
export function changeSummary(description: AuditDescription): string | null {
  const [first] = description.changes;
  return first && first.from !== null ? `${first.from} → ${first.to}` : null;
}
