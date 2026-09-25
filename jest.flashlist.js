// FlashList lays its rows out from measured sizes, and there is no layout pass under Jest, so it would render no rows
// at all. This fixes the measurements (a 400 x 900 screen, 100 dp rows) so tests see the rows. It replaces the package's
// own jestSetup.js, which in 2.0.2 swaps FlashList for a `RecyclerView` export that no longer exists.
jest.mock('@shopify/flash-list/dist/recyclerview/utils/measureLayout', () => ({
  ...jest.requireActual('@shopify/flash-list/dist/recyclerview/utils/measureLayout'),
  measureParentSize: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 900 })),
  measureFirstChildLayout: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 900 })),
  measureItemLayout: jest.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
}));
