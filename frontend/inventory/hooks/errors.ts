import { isApiError, type FieldError } from '../../services/api/errors';
import { errorMessage } from '../../utils/errorMessage';

// What the dealer calls each field the inventory API validates (backend/app/inventory/schemas.py), so a 422 names the
// field as the form does instead of as the JSON key.
const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'Name',
  sku: 'SKU',
  unit: 'Unit',
  kind: 'Kind',
  address: 'Address',
  contact: 'Contact',
  products_supplied: 'Products supplied',
  notes: 'Notes',
  reference: 'Reference',
  purchased_on: 'Purchase date',
  quantity: 'Quantity',
  reason: 'Reason',
  cost_price: 'Cost price',
  selling_price: 'Selling price',
  reorder_threshold: 'Reorder threshold',
  default_reorder_threshold: 'Default reorder threshold',
  unit_cost: 'Unit cost',
  product_id: 'Product',
  location_id: 'Location',
  from_location_id: 'From location',
  to_location_id: 'To location',
  supplier_id: 'Supplier',
  listing_id: 'Listing',
  items: 'Lines',
};

/** "Quantity: Use at most two decimals", or "Line 2, quantity: …" for a purchase line. */
function describeField({ loc, msg }: FieldError): string {
  const path = loc.filter(part => part !== 'body');
  const field =
    [...path]
      .reverse()
      .find((part): part is string => typeof part === 'string') ?? '';
  const line = path.findIndex(part => part === 'items');
  const index = line >= 0 ? path[line + 1] : undefined;
  const label = FIELD_LABELS[field] ?? 'A field';
  // Pydantic prefixes a custom validator's text with "Value error, "; the rest is written for the person typing.
  const text = msg.replace(/^Value error, /, '');
  const where =
    typeof index === 'number' && field !== 'items'
      ? `Line ${index + 1}, ${label.toLowerCase()}`
      : label;
  return `${where}: ${text}`;
}

/**
 * The text a dealer sees for a failed inventory write.
 *
 * - The stock functions' refusals (`insufficient_stock`, a `validation_failed` with no field) carry a message that says
 *   how to correct the entry ("Only 3 in stock at this location"), which backend/app/inventory/errors.py keeps as the
 *   problem title.
 * - A 409 from the inventory routes (`conflict`: the default location rules, a listing linked elsewhere; and
 *   `invalid_transition`: "This purchase is already received") is worded for the dealer the same way.
 * - A 422 with fields names each field and why, as the form labels it.
 * - Everything else (offline, a session problem) is mapped from its code like the rest of the app.
 */
export function inventoryErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 422 && error.fields.length > 0)
      return error.fields.map(describeField).join('\n');
    // A body without a title (a proxy's page) leaves the client's "Request failed (409)", which says nothing.
    const worded = !error.message.startsWith('Request failed');
    if (
      worded &&
      error.status === 422 &&
      (error.code === 'insufficient_stock' ||
        error.code === 'validation_failed')
    ) {
      return error.message;
    }
    if (
      worded &&
      error.status === 409 &&
      (error.code === 'conflict' || error.code === 'invalid_transition')
    ) {
      return error.message;
    }
  }
  return errorMessage(error);
}

/** A write whose answer never arrived: it may well have been saved, so it is not called "not saved". */
const UNCONFIRMED_WRITE =
  "We couldn't confirm this was saved. Check Activity history before entering it again.";
const ENTRY_ALREADY_SENT =
  'This entry was already sent with different details; check Activity history.';

/**
 * The text for a failed stock write that carries an Idempotency-Key (Stock In, Stock Out, Adjustment, Transfer and
 * purchase create; B4 verification F2). A dropped connection or a timeout after sending leaves the outcome unknown, so
 * the dealer is sent to the history rather than told to enter it again; the same entry sent again with other details is
 * refused by the server, and says so. A write refused before sending (offline) keeps its own message.
 */
export function writeErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    // A gateway's 502 or 504 can come after the API committed, so it is as unknown as a dropped connection.
    if (
      error.code === 'network' ||
      error.code === 'timeout' ||
      error.status === 502 ||
      error.status === 504
    ) {
      return UNCONFIRMED_WRITE;
    }
    if (error.code === 'idempotency_key_reused') return ENTRY_ALREADY_SENT;
  }
  return inventoryErrorMessage(error);
}

/** The banner title for a write's error: "Not saved" would contradict the body when the server may well have saved it
 * (B4 re-verification N1), so the unconfirmed case says so in its title too. */
export function writeErrorTitle(message: string): string {
  return message === UNCONFIRMED_WRITE ? 'Not confirmed' : 'Not saved';
}
