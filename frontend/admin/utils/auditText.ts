// Admin: turns raw audit-log rows into plain-English sentences for the audit screen.
import { ROLE_LABELS, type Role } from '../../common/constants/roles';
import { statusMeta, type StatusKind } from '../../common/constants/status';
import type { AuditLogEntryWithActor } from '../types/audit';

/** The audit log in plain words (AD-07, SRDS §51): "Sana approved a dealer application", not `dealer_application_approved`,
 * and "Listed → Hidden" from the old and new state, not JSON. The API sends no name for the item acted on (only its table
 * and id), so a sentence names the kind of item and the detail sheet shows its short id.
 *
 * Since A7 every action is one of the SRDS §51 event names (`audit_event_names`); the database trigger that writes the row
 * says which kind of change it was in `metadata.change` (create, update, delete, hide, restore, cancel, resolve_dispute,
 * close), and older rows renamed to a §51 name keep their old name there. */

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
  consultations: 'Consultation',
  disease_knowledge: 'Disease advice',
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
  hidden_at: 'Review',
};

// Not worth a line: the item's own id, bookkeeping, and fields a person never typed or that the sentence already carries.
// The reasons are shown on their own line (reasonOf), so they are not repeated as a change.
const HIDDEN_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'account_status_reason',
  'hidden_reason',
  'admin_action_reason',
  'moderation_reason',
  'sort_order',
  'slug',
  'icon',
]);

// Turns snake_case into a capitalised phrase: 'open_report' -> 'Open report'.
const sentenceCase = (value: string) => {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const STATUS_KIND_BY_ENTITY: Record<string, StatusKind> = {
  listings: 'listing',
  reports: 'report',
  order: 'order',
  orders: 'order',
  consultations: 'consultation',
};

// Shows one recorded field value in plain words (status labels, Yes/No, None).
function formatValue(entity: string, key: string, value: unknown): string {
  if (key === 'hidden_at') return value ? 'Hidden' : 'Shown';
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

// Lists the fields that changed between the old and new state.
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

// Finds the admin's reason in the metadata or the new state, if any.
function reasonOf(entry: AuditLogEntryWithActor): string | null {
  const meta = entry.metadata ?? {};
  for (const key of ['reason', 'notes']) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  for (const key of ['account_status_reason', 'hidden_reason', 'admin_action_reason', 'moderation_reason']) {
    const fromState = entry.new_state?.[key];
    if (typeof fromState === 'string' && fromState.trim()) return fromState.trim();
  }
  return null;
}

/** What kind of change the trigger recorded: `metadata.change`, else read from which states are present. */
function changeOf(entry: AuditLogEntryWithActor): string {
  const recorded = entry.metadata?.change;
  if (typeof recorded === 'string') return recorded;
  if (!entry.previous_state && entry.new_state) return 'create';
  if (entry.previous_state && !entry.new_state) return 'delete';
  return 'update';
}

// The verb part of the sentence, e.g. 'approved a dealer application'.
function verbPhrase(entry: AuditLogEntryWithActor): string {
  const application = /^(dealer|expert)_application_(approved|rejected)$/.exec(entry.action);
  if (application) return `${application[2] === 'approved' ? 'approved' : 'rejected'} ${application[1] === 'expert' ? 'an' : 'a'} ${application[1]} application`;
  const named = (typeof entry.new_state?.name === 'string' && entry.new_state.name) || (typeof entry.new_state?.label === 'string' && entry.new_state.label) || null;
  const change = changeOf(entry);
  // A create, update or delete of a settings row ("create_category" on rows renamed in A7).
  const kind = /create/.test(change) ? 'create' : /delete/.test(change) ? 'delete' : 'update';
  switch (entry.action) {
    case 'user_suspended':
      return 'suspended an account';
    case 'user_reactivated':
      return 'lifted the suspension on an account';
    case 'user_role_changed':
      return "changed an account's role";
    case 'report_resolved':
      return 'resolved a report';
    case 'report_dismissed':
      return 'dismissed a report';
    case 'report_updated':
      return 'updated a report';
    case 'product_moderated': {
      const status = entry.new_state?.status;
      return status === 'inactive' ? 'hid a listing' : status === 'active' ? 'restored a listing' : 'changed a listing';
    }
    case 'review_moderated':
      return change === 'restore' ? 'restored a review' : change === 'hide' ? 'hid a review' : 'moderated a review';
    case 'order_administrative_action':
      if (change === 'cancel') return 'cancelled an order';
      if (change === 'resolve_dispute' || change === 'resolve_order_dispute') return 'settled an order dispute';
      return 'acted on an order';
    case 'consultation_moderated':
      return change === 'close' ? 'closed a consultation' : change === 'cancel' ? 'cancelled a consultation' : 'moderated a consultation';
    case 'message_redacted':
      return 'removed a message';
    case 'category_changed':
      if (kind === 'create') return named ? `added the category "${named}"` : 'added a category';
      if (kind === 'delete') return 'deleted a category';
      return named ? `renamed a category to "${named}"` : 'changed a category';
    case 'reference_data_changed':
      if (kind === 'create') return `added an entry to the ${entry.target_entity} list`;
      if (kind === 'delete') return `deleted an entry from the ${entry.target_entity} list`;
      return `changed an entry in the ${entry.target_entity} list`;
    case 'required_document_changed':
      if (kind === 'create') return named ? `added the required document "${named}"` : 'added a required document';
      return named ? `changed the required document "${named}"` : 'changed a required document';
    case 'ai_configuration_changed':
      return 'changed the disease advice';
    case 'admin_email_changed':
      return 'changed their sign-in email';
    case 'account_self_deleted':
      return 'deleted their own account';
    default:
      // A name outside this list still reads as words: the API's own §51 label, else the name itself.
      return (entry.action_label || sentenceCase(entry.action)).toLowerCase();
  }
}

// Builds the full plain-English description of one audit entry.
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
