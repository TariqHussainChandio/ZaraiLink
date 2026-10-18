import { z } from 'zod';

// The text-field rules the inventory forms share. Fields hold the typed text; it becomes a number only on submit.
// They mirror the API's own checks (backend/app/inventory/schemas.py), so the dealer is told on the phone, field by
// field, instead of by a refused request.

const NUMBER = /^\d+(\.\d{1,2})?$/;

/** What numeric(12, 2) holds: every quantity and amount stays below it (NUMERIC_LIMIT in the API). */
const NUMBER_LIMIT = 10_000_000_000;

/** The API's length caps on free text (NAME_MAX and the rest in schemas.py). */
export const TEXT_LIMITS = {
  name: 120,
  unit: 40,
  reference: 80,
  contact: 120,
  address: 300,
  text: 1000,
} as const;

const NUMBER_HINT = 'Enter a number, such as 12 or 12.5 (at most two decimals)';
const TOO_LARGE = 'Enter a smaller number';

/** A quantity or an amount, zero or more, up to two decimals; empty is allowed (the field is optional). */
export const optionalNumber = z
  .string()
  .trim()
  .refine(value => value === '' || NUMBER.test(value), NUMBER_HINT)
  .refine(value => value === '' || Number(value) < NUMBER_LIMIT, TOO_LARGE);

/** A quantity that must be entered and be more than zero. */
export const positiveNumber = z
  .string()
  .trim()
  .refine(value => NUMBER.test(value) && Number(value) > 0, 'Enter a quantity above zero, with at most two decimals')
  .refine(value => !NUMBER.test(value) || Number(value) < NUMBER_LIMIT, TOO_LARGE);

/** Free text the API caps at `max` characters; checked after trimming, as the API stores it. */
export function cappedText(max: number) {
  return z
    .string()
    .refine(value => value.trim().length <= max, `Use at most ${max} characters`);
}

/** The typed text as a number, or null for an empty optional field. */
export function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : Number(trimmed);
}

/** An optional text field as the API wants it: null when empty. */
export function toTextOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
