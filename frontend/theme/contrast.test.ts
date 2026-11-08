import { type ThemeColors, darkColors, lightColors } from './colors';

// Every pairing the design system (D15, Rate Board) relies on, held to WCAG 2 in both themes: text 4.5:1, icons, control borders and the
// focus ring 3:1. A token changed to a value that fails here would make some screen unreadable in the field.
function channel(hex: string, at: number): number {
  const c = parseInt(hex.slice(at, at + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

type Pair = [label: string, fg: (c: ThemeColors) => string, bg: (c: ThemeColors) => string, min: number];

const grounds: [string, (c: ThemeColors) => string][] = [
  ['ground', c => c.ground],
  ['surface', c => c.surface],
  ['surfaceSunken', c => c.surfaceSunken],
];
const accents = ['brand', 'farmer', 'buyer', 'dealer', 'expert', 'admin', 'ai'] as const;
const tones = ['info', 'success', 'warning', 'neutral', 'danger'] as const;

const pairs: Pair[] = [];
for (const [name, bg] of grounds) {
  pairs.push([`ink on ${name}`, c => c.ink, bg, 4.5]);
  pairs.push([`ink2 on ${name}`, c => c.ink2, bg, 4.5]);
  pairs.push([`ink3 on ${name}`, c => c.ink3, bg, 4.5]);
  pairs.push([`lineStrong on ${name}`, c => c.lineStrong, bg, 3]);
  pairs.push([`focus on ${name}`, c => c.focus, bg, 3]);
}
for (const a of accents) {
  pairs.push([`onAccent on ${a}.fill`, c => c.onAccent, c => c.accent[a].fill, 4.5]);
  pairs.push([`${a}.fill on surface`, c => c.accent[a].fill, c => c.surface, 3]);
  pairs.push([`${a}.fill on ground`, c => c.accent[a].fill, c => c.ground, 3]);
  pairs.push([`${a}.ink on surface`, c => c.accent[a].ink, c => c.surface, 4.5]);
  pairs.push([`${a}.ink on ground`, c => c.accent[a].ink, c => c.ground, 4.5]);
  pairs.push([`${a}.ink on ${a}.soft`, c => c.accent[a].ink, c => c.accent[a].soft, 4.5]);
  pairs.push([`${a}.mark on surface`, c => c.accent[a].mark, c => c.surface, 3]);
}
for (const t of tones) {
  pairs.push([`${t}.ink on ${t}.soft`, c => c.status[t].ink, c => c.status[t].soft, 4.5]);
  pairs.push([`${t}.mark on ${t}.soft`, c => c.status[t].mark, c => c.status[t].soft, 3]);
  pairs.push([`${t}.mark on surface`, c => c.status[t].mark, c => c.surface, 3]);
  pairs.push([`${t}.ink on surface`, c => c.status[t].ink, c => c.surface, 4.5]);
}
// The rate plate: chalk on the board (no control ever sits on one).
pairs.push(['onBoard on board', c => c.onBoard, c => c.board, 4.5]);
pairs.push(['boardInk2 on board', c => c.boardInk2, c => c.board, 4.5]);
pairs.push(['onAccent on danger.fill', c => c.onAccent, c => c.status.danger.fill, 4.5]);
pairs.push(['rating on surface', c => c.rating, c => c.surface, 3]);
pairs.push(['danger.fill on surface', c => c.status.danger.fill, c => c.surface, 3]);
pairs.push(['payments on surface', c => c.module.payments, c => c.surface, 3]);
pairs.push(['paymentsInk on surface', c => c.module.paymentsInk, c => c.surface, 4.5]);
pairs.push(['notificationsInk on notificationsSoft', c => c.module.notificationsInk, c => c.module.notificationsSoft, 4.5]);
pairs.push(['onNotifications on notifications', c => c.module.onNotifications, c => c.module.notifications, 4.5]);
// The ring of a tab's "new" dot: the dot's only edge against the tab bar.
pairs.push(['notificationsInk on surface', c => c.module.notificationsInk, c => c.surface, 3]);

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('%s theme contrast', (_theme, colors) => {
  it.each(pairs)('%s', (_label, fg, bg, min) => {
    expect(contrast(fg(colors), bg(colors))).toBeGreaterThanOrEqual(min);
  });

  it('keeps a failure apart from a success by lightness, not hue alone', () => {
    expect(contrast(colors.status.success.soft, colors.status.danger.fill)).toBeGreaterThanOrEqual(3);
  });
});
