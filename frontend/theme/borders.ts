// Border widths (A2, D14): hairline for card borders and dividers (in `line`), control for inputs and secondary
// buttons (in `lineStrong`), selected for a chosen card or option (in the scope's accent), focus for the focus ring,
// band for the dealer strip across the top of every inventory-system app bar.
export const borders = {
  hairline: 1,
  control: 1,
  selected: 2,
  focus: 2,
  band: 4,
} as const;
