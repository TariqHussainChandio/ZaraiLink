// Money in the design system's format (D15): "Rs" and en-PK grouping, no decimals (Rs 950, Rs 12,450, Rs 124,500).
// Prices are whole rupees; formatting by hand is how "Rs. 12450" crept in, so every amount goes through here.
const RUPEES = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });

/** The number alone, grouped the en-PK way: "12,450". For a figure that carries its own unit ("120 bags") or whose "Rs"
 * is drawn separately, as in a price. */
export function formatAmount(amount: number): string {
  return RUPEES.format(amount);
}

// Formats an amount as rupees, like "Rs 12,450".
export function formatRs(amount: number): string {
  return `Rs ${formatAmount(amount)}`;
}
