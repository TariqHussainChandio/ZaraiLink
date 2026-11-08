// Fixed sizes (D15, Rate Board). Everything tappable is at least touchMin; a smaller control gets hitSlop to reach it.
export const size = {
  /** Minimum hit area for anything tappable. */
  touchMin: 48,
  /** Full-width primary action in a sticky bar or at the end of a form. */
  buttonLg: 56,
  /** Buttons inside cards, rows and banners: a full touch target without hitSlop. */
  buttonMd: 48,
  /** Dense admin and inventory rows only, with hitSlop to touchMin. */
  buttonSm: 40,
  /** Chips, with hitSlop to touchMin. */
  chip: 40,
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
  cardImage: 148,
  /** The photo at the top of a listing, and the plant photo in the disease advisory. */
  photoHero: 240,
  /** The bar area of a bar chart (labels sit outside it, so they never overlap a bar at a large font scale). */
  chartBars: 140,
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
