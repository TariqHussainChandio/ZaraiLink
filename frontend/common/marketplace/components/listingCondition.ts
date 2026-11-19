/** The words a listing's condition is stored as, and how a person reads them. `condition` is free text (the form takes
 * any words, and the API and older listings write lowercase keys such as "new"), so a known key gets its label and any
 * other text is shown in sentence case with underscores read as spaces, never as the raw stored value (A8 finding). */
const LABELS: Record<string, string> = {
  new: 'New',
  used: 'Used',
  like_new: 'Like new',
  refurbished: 'Refurbished',
};

export function conditionLabel(condition: string | null | undefined): string | null {
  const text = condition?.trim();
  if (!text) return null;
  const known = LABELS[text.toLowerCase().replace(/[\s-]+/g, '_')];
  if (known) return known;
  const spaced = text.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
