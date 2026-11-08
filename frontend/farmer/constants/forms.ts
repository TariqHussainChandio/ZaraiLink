import type { FarmCropWithCrop } from '../types/farmer';

// What the farm and crop forms accept (FA-22). Shared by both forms and by the lists that show the saved values.

/** The stages a farmer picks from. The column is free text, so a stage saved before this list existed still shows (see
 * `growthStageOptions`). */
const GROWTH_STAGES = ['Planned', 'Sown', 'Growing', 'Flowering', 'Ready to harvest', 'Harvested'] as const;

/** Digits with an optional decimal point: "2", "2.5". A comma is refused rather than guessed at: "2,5" and "1,200" read
 * differently in different places, and the old form saved neither (audit FA-22). */
const AREA_PATTERN = /^\d+(\.\d+)?$/;

export function isValidArea(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === '' || (AREA_PATTERN.test(trimmed) && Number(trimmed) > 0);
}

/** The number to send, or `null` for an empty box. Call after `isValidArea` has passed. */
export function parseArea(text: string): number | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : Number(trimmed);
}

/** Shown under every date box: dates are typed until the native picker is allowed (it is a native module). */
export const DATE_HELPER = 'Type it as year-month-day, for example 2026-03-14';

/** "2026-03-14" and a real calendar day: "2026-02-30" is refused, not rolled into March. */
export function isValidDate(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The stage chips, plus the saved stage when it is not one of them, so editing an old record never drops it. */
export function growthStageOptions(current: string): { value: string; label: string }[] {
  const listed = GROWTH_STAGES.map(stage => ({ value: stage as string, label: stage }));
  return current && !GROWTH_STAGES.some(stage => stage === current) ? [{ value: current, label: current }, ...listed] : listed;
}

/** "10 Acre", or just "10" when the unit is not known; `null` when no area is recorded. */
export function formatArea(area: number | null, unitCode: string | null, units: { code: string; label: string }[]): string | null {
  if (area === null) return null;
  const unit = units.find(u => u.code === unitCode)?.label ?? unitCode;
  return [area.toLocaleString('en-PK'), unit].filter(Boolean).join(' ');
}

/** What a crop row says under its name: "Basmati · Flowering", or nothing yet. */
export function cropMeta(crop: Pick<FarmCropWithCrop, 'variety' | 'growth_stage'>): string | undefined {
  return [crop.variety, crop.growth_stage].filter(Boolean).join(' · ') || undefined;
}
