// Fixed sizes (A2, D14). Everything tappable is at least touchMin; a smaller control gets hitSlop to reach it.
export const size = {
  /** Minimum hit area for anything tappable. */
  touchMin: 48,
  /** Full-width primary action in a sticky bar or at the end of a form. */
  buttonLg: 52,
  /** Buttons inside cards and rows. */
  buttonMd: 44,
  /** Compact buttons in dense admin and inventory rows. */
  buttonSm: 36,
  /** Chips. */
  chip: 36,
  /** Text fields, selects and code cells. */
  input: 52,
  /** Top app bar. */
  appBar: 56,
  /** Bottom tab bar, above the system gesture inset. */
  tabBar: 64,
  /** A list row's minimum height. */
  row: 64,
  /** Icons in badges, chips and captions. */
  iconSm: 16,
  /** Icons in buttons. */
  iconButton: 20,
  /** The default icon: app bar, tabs, list leading icons. */
  iconMd: 24,
  /** Lucide's stroke; the bold stroke draws a check or a cross inside a small filled disc. */
  iconStroke: 2,
  iconStrokeBold: 3,
  /** Empty and error state icons. */
  iconLg: 32,
  /** The tinted disc behind an empty state icon. */
  iconDisc: 64,
  avatarSm: 32,
  avatarMd: 40,
  avatarLg: 64,
  /** A product or listing thumbnail in a row. */
  thumb: 56,
  /** Photos a person has added to a form: consultation photos (sm), listing photos (md). */
  photoSm: 64,
  photoMd: 72,
  /** A photo in a chat bubble, a document preview, a listing card in a two-column grid. */
  photoLg: 120,
  /** A product photo at the top of a card. */
  cardImage: 160,
  /** The photo at the top of a listing, and the plant photo in the disease advisory. */
  photoHero: 220,
  /** The tallest a multi-line chat input grows before it scrolls. */
  composerMax: 120,
  /** The tallest a list inside a sheet grows before it scrolls. */
  sheetListMax: 320,
  /** The two-factor setup QR code: large enough for an authenticator app to read at arm's length. */
  qrCode: 200,
  /** The dot on a tab or bell that marks something new. */
  dot: 9,
  /** The amber count badge. */
  countBadge: 20,
  /** Content width cap on tablets, centred. */
  contentMax: 600,
} as const;
