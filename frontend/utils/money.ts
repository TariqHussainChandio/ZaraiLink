// Money in the design system's format (A2, D14): "Rs" and en-PK grouping, no decimals (Rs 950, Rs 12,450, Rs 124,500).
// Prices are whole rupees; formatting by hand is how "Rs. 12450" crept in, so every amount goes through here.
const RUPEES = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });

export function formatRs(amount: number): string {
  return `Rs ${RUPEES.format(amount)}`;
}
