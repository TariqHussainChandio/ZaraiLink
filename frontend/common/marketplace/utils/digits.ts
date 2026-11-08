// Whole numbers typed into a price, quantity or delivery box (audit MK-04, MK-10). Money here is whole rupees, so only the
// digits count: a pasted "1,500", "Rs 1500" or "1 500" is 1500. The old `Number(text) || 0` turned all three into Rs 0 and
// the old filter sent NaN to the API.

/** The digits of what was typed, as typed ("1,500" -> "1500"); "" when there are none. */
export function digitsOnly(text: string): string {
  return text.replace(/\D/g, '');
}

/** The whole number typed, or null when no digit was typed (an empty box is "nothing", not zero). */
export function parseWhole(text: string): number | null {
  const digits = digitsOnly(text);
  return digits ? Number(digits) : null;
}
