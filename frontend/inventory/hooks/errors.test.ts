import { apiError } from '../testUtils/fixtures';
import { inventoryErrorMessage, writeErrorMessage } from './errors';

// The API's refusals must reach the dealer as words they can act on (B4 card): the stock functions' messages, the
// 409s of the purchase and default-location rules, and 422 field errors named as the form names them.
describe('inventoryErrorMessage', () => {
  it('shows the stock function’s own words for a shortage (insufficient_stock)', () => {
    expect(inventoryErrorMessage(apiError(422, 'insufficient_stock', 'Only 3 in stock at this location'))).toBe(
      'Only 3 in stock at this location',
    );
  });

  it('shows a refusal of the stock functions that names no field (validation_failed)', () => {
    expect(inventoryErrorMessage(apiError(422, 'validation_failed', 'A reason is required for an adjustment'))).toBe(
      'A reason is required for an adjustment',
    );
  });

  it('says a purchase is already received (invalid_transition, 409)', () => {
    expect(inventoryErrorMessage(apiError(409, 'invalid_transition', 'This purchase is already received'))).toBe(
      'This purchase is already received',
    );
  });

  it('explains the default location rule (conflict, 409)', () => {
    const error = apiError(409, 'conflict', 'This is the default location; make another location the default first');
    expect(inventoryErrorMessage(error)).toBe('This is the default location; make another location the default first');
  });

  it('names each invalid field as the form does, without pydantic’s prefix', () => {
    const error = apiError(422, 'validation_failed', 'Validation failed', [
      { loc: ['body', 'quantity'], msg: 'Value error, Use at most two decimals' },
      { loc: ['body', 'name'], msg: 'String should have at most 120 characters' },
    ]);
    expect(inventoryErrorMessage(error)).toBe(
      'Quantity: Use at most two decimals\nName: String should have at most 120 characters',
    );
  });

  it('points to the purchase line a field error belongs to', () => {
    const error = apiError(422, 'validation_failed', 'Validation failed', [
      { loc: ['body', 'items', 1, 'unit_cost'], msg: 'Input should be greater than or equal to 0' },
    ]);
    expect(inventoryErrorMessage(error)).toBe('Line 2, unit cost: Input should be greater than or equal to 0');
  });

  it('falls back to the app’s message for a body without a title, and for offline', () => {
    expect(inventoryErrorMessage(apiError(409, 'conflict', 'Request failed (409)'))).toBe(
      'This already exists or is still in use.',
    );
    expect(inventoryErrorMessage(apiError(0, 'network', 'No connection to the server'))).toBe(
      'No internet connection. Check your connection and try again.',
    );
  });

  it('never shows the English title of another code (a 403 says the app’s words)', () => {
    expect(inventoryErrorMessage(apiError(403, 'account_not_approved', 'Dealer not approved'))).toBe(
      'Your application is waiting for an administrator.',
    );
  });
});

// B4 verification F2: a stock write whose answer never arrived may have been saved.
describe('writeErrorMessage', () => {
  const unconfirmed = "We couldn't confirm this was saved. Check Activity history before entering it again.";

  it.each([
    apiError(0, 'network', 'No connection to the server'),
    apiError(0, 'timeout', 'The request timed out'),
    apiError(502, 'server_error', 'Bad gateway'),
    apiError(504, 'server_error', 'Gateway timeout'),
  ])('calls %p unconfirmed, never "not saved"', error => {
    expect(writeErrorMessage(error)).toBe(unconfirmed);
  });

  it('explains a key the server already has with other details', () => {
    expect(writeErrorMessage(apiError(422, 'idempotency_key_reused', 'Idempotency key reused'))).toBe(
      'This entry was already sent with different details; check Activity history.',
    );
  });

  it('leaves the answers the server did give (a shortage, a 500 that rolled back) to inventoryErrorMessage', () => {
    expect(writeErrorMessage(apiError(422, 'insufficient_stock', 'Only 2 in stock at this location'))).toBe(
      'Only 2 in stock at this location',
    );
    expect(writeErrorMessage(apiError(500, 'server_error', 'Internal'))).toBe(
      'Something went wrong on our side. Please try again shortly.',
    );
  });
});
