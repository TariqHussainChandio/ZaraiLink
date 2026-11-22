import React from 'react';
import { Text } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { FilterBar } from './FilterBar';
import { fetchCategories, fetchListingFilterOptions } from '../services/listingsService';

jest.mock('../services/listingsService', () => ({
  fetchCategories: jest.fn(),
  fetchListingFilterOptions: jest.fn(),
}));

const baseProps = {
  search: '',
  onSearchChange: jest.fn(),
  minPrice: null,
  maxPrice: null,
  city: null,
  categoryId: null,
  onApplyMoreFilters: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (fetchCategories as jest.Mock).mockResolvedValue([
    { id: 'c1', name: 'Seeds' },
    { id: 'c2', name: 'Fertilizers' },
  ]);
  (fetchListingFilterOptions as jest.Mock).mockResolvedValue({ cities: ['Lahore', 'Okara'], min_price: 150, max_price: 4800 });
});

describe('FilterBar', () => {
  it('offers search and filters only, with no category chips (D20)', async () => {
    await renderWithQuery(<FilterBar {...baseProps} />);
    expect(screen.getByLabelText('Search the market')).toBeTruthy();
    expect(screen.getByLabelText('Filters')).toBeTruthy();
    expect(screen.queryByText('All')).toBeNull();
  });

  it('waits for typing to stop before searching: one request, not one per letter (MK-13)', async () => {
    const onSearchChange = jest.fn();
    await renderWithQuery(<FilterBar {...baseProps} onSearchChange={onSearchChange} />);
    const box = screen.getByLabelText('Search the market');
    await fireEvent.changeText(box, 'u');
    await fireEvent.changeText(box, 'ur');
    await fireEvent.changeText(box, 'urea');
    expect(onSearchChange).not.toHaveBeenCalled();
    await waitFor(() => expect(onSearchChange).toHaveBeenCalledWith('urea'));
    expect(onSearchChange).toHaveBeenCalledTimes(1);
  });

  it('searches at once on the keyboard search key', async () => {
    const onSearchChange = jest.fn();
    await renderWithQuery(<FilterBar {...baseProps} onSearchChange={onSearchChange} />);
    const box = screen.getByLabelText('Search the market');
    await fireEvent.changeText(box, 'dap');
    await fireEvent(box, 'submitEditing');
    expect(onSearchChange).toHaveBeenCalledWith('dap');
  });

  it('puts a search that was cleared elsewhere (Clear filters) back into the box', async () => {
    function Wrap() {
      const [search, setSearch] = React.useState('urea');
      return (
        <>
          <FilterBar {...baseProps} search={search} />
          <Text onPress={() => setSearch('')}>Clear from outside</Text>
        </>
      );
    }
    await renderWithQuery(<Wrap />);
    expect(screen.getByDisplayValue('urea')).toBeTruthy();
    await fireEvent.press(screen.getByText('Clear from outside'));
    expect(screen.queryByDisplayValue('urea')).toBeNull();
  });

  it('opens the filters directly under the filter icon, not from the bottom of the screen (D20)', async () => {
    await renderWithQuery(<FilterBar {...baseProps} />);
    // The icon's top is at 120 on the screen (pageY 140, pressed 20 into it).
    await fireEvent.press(screen.getByLabelText('Filters'), { nativeEvent: { pageX: 330, pageY: 140, locationX: 20, locationY: 20 } });
    const header = await screen.findByRole('header', { name: 'Filters' });
    let node = header.parent;
    while (node && node.props.accessibilityViewIsModal !== true) node = node.parent;
    const style = Object.assign({}, ...[node?.props.style].flat(Infinity).filter(Boolean));
    expect(style.position).toBe('absolute');
    expect(style.top).toBeGreaterThan(120);
    expect(style.bottom).toBeUndefined();
  });

  it('counts the filters in force on the Filters button and shows a removable chip for each', async () => {
    const onApplyMoreFilters = jest.fn();
    await renderWithQuery(<FilterBar {...baseProps} minPrice={100} city="Lahore" onApplyMoreFilters={onApplyMoreFilters} />);
    expect(screen.getByLabelText('Filters, 2 on')).toBeTruthy();
    expect(screen.getByText('From Rs 100')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove filter: Lahore' }));
    expect(onApplyMoreFilters).toHaveBeenCalledWith({ minPrice: 100, maxPrice: null, city: null, categoryId: null });
  });

  it('opens a titled filter panel with price, city and a category dropdown, and no crops, country or province', async () => {
    await renderWithQuery(<FilterBar {...baseProps} />);
    await fireEvent.press(screen.getByLabelText('Filters'));
    expect(await screen.findByRole('header', { name: 'Filters' })).toBeTruthy();
    // Tapping outside the panel closes it, as with any dropdown.
    expect(screen.getByTestId('dropdown-backdrop', { includeHiddenElements: true })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'City, All cities' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Category, All categories' })).toBeTruthy();
    expect(screen.queryByText('Crop')).toBeNull();
    expect(screen.queryByText('Province')).toBeNull();
    expect(screen.queryByText('Country')).toBeNull();
  });

  it('applies price, city and the category picked from the dropdown', async () => {
    const onApplyMoreFilters = jest.fn();
    await renderWithQuery(<FilterBar {...baseProps} onApplyMoreFilters={onApplyMoreFilters} />);
    await fireEvent.press(screen.getByLabelText('Filters'));
    await fireEvent.changeText(await screen.findByTestId('filter-min-price'), '100');
    await fireEvent.changeText(screen.getByTestId('filter-max-price'), '500');
    await fireEvent.press(await screen.findByRole('button', { name: 'City, All cities' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Okara', includeHiddenElements: true }));
    await fireEvent.press(screen.getByRole('button', { name: 'Category, All categories' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Fertilizers', includeHiddenElements: true }));
    await fireEvent.press(screen.getByText('Show results'));
    expect(onApplyMoreFilters).toHaveBeenCalledWith({ minPrice: 100, maxPrice: 500, city: 'Okara', categoryId: 'c2' });
  });

  it('shows the category in force as a removable chip', async () => {
    const onApplyMoreFilters = jest.fn();
    await renderWithQuery(<FilterBar {...baseProps} categoryId="c1" onApplyMoreFilters={onApplyMoreFilters} />);
    expect(screen.getByLabelText('Filters, 1 on')).toBeTruthy();
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove filter: Seeds' }));
    expect(onApplyMoreFilters).toHaveBeenCalledWith({ minPrice: null, maxPrice: null, city: null, categoryId: null });
  });

  it('reads "1,000" as 1000, never as NaN (MK-10)', async () => {
    const onApplyMoreFilters = jest.fn();
    await renderWithQuery(<FilterBar {...baseProps} onApplyMoreFilters={onApplyMoreFilters} />);
    await fireEvent.press(screen.getByLabelText('Filters'));
    await fireEvent.changeText(await screen.findByTestId('filter-max-price'), '1,000');
    await fireEvent.press(screen.getByText('Show results'));
    expect(onApplyMoreFilters).toHaveBeenCalledWith({ minPrice: null, maxPrice: 1000, city: null, categoryId: null });
  });

  it('refuses a maximum that is not above the minimum, and says so', async () => {
    const onApplyMoreFilters = jest.fn();
    await renderWithQuery(<FilterBar {...baseProps} onApplyMoreFilters={onApplyMoreFilters} />);
    await fireEvent.press(screen.getByLabelText('Filters'));
    await fireEvent.changeText(await screen.findByTestId('filter-min-price'), '500');
    await fireEvent.changeText(screen.getByTestId('filter-max-price'), '100');
    expect(screen.getByText('The maximum must be more than the minimum')).toBeTruthy();
    await fireEvent.press(screen.getByText('Show results'));
    expect(onApplyMoreFilters).not.toHaveBeenCalled();
  });

  it('clears every filter from the panel', async () => {
    const onApplyMoreFilters = jest.fn();
    await renderWithQuery(<FilterBar {...baseProps} minPrice={100} maxPrice={500} onApplyMoreFilters={onApplyMoreFilters} />);
    await fireEvent.press(screen.getByLabelText('Filters, 2 on'));
    await fireEvent.press(await screen.findByText('Clear filters'));
    expect(onApplyMoreFilters).toHaveBeenCalledWith({ minPrice: null, maxPrice: null, city: null, categoryId: null });
  });

  it('lists the categories on the platform now: one added since the market opened shows the next time the filters open', async () => {
    await renderWithQuery(<FilterBar {...baseProps} />);
    await waitFor(() => expect(fetchCategories).toHaveBeenCalledTimes(1));
    (fetchCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'Seeds' },
      { id: 'c2', name: 'Fertilizers' },
      { id: 'c3', name: 'Pesticides' },
    ]);
    await fireEvent.press(screen.getByLabelText('Filters'));
    await waitFor(() => expect(fetchCategories).toHaveBeenCalledTimes(2));
    await fireEvent.press(await screen.findByRole('button', { name: 'Category, All categories' }));
    expect(await screen.findByRole('button', { name: 'Pesticides', includeHiddenElements: true })).toBeTruthy();
  });

  it('offers the cities that have listings and shows the price range on the market now, both from the platform', async () => {
    await renderWithQuery(<FilterBar {...baseProps} />);
    await waitFor(() => expect(fetchListingFilterOptions).toHaveBeenCalledTimes(1));
    // A listing in a new city, and a dearer one, since the market opened: the next opening of the filters shows them.
    (fetchListingFilterOptions as jest.Mock).mockResolvedValue({ cities: ['Lahore', 'Multan', 'Okara'], min_price: 150, max_price: 9000 });
    await fireEvent.press(screen.getByLabelText('Filters'));
    await waitFor(() => expect(fetchListingFilterOptions).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('On the market now: Rs 150 to Rs 9,000')).toBeTruthy();
    expect(screen.getByTestId('filter-max-price').props.placeholder).toBe('9000');
    await fireEvent.press(screen.getByRole('button', { name: 'City, All cities' }));
    expect(await screen.findByRole('button', { name: 'Multan', includeHiddenElements: true })).toBeTruthy();
  });

  it('says nothing about a price range when nothing is for sale', async () => {
    (fetchListingFilterOptions as jest.Mock).mockResolvedValue({ cities: [], min_price: null, max_price: null });
    await renderWithQuery(<FilterBar {...baseProps} />);
    await fireEvent.press(screen.getByLabelText('Filters'));
    await screen.findByRole('header', { name: 'Filters' });
    await waitFor(() => expect(fetchListingFilterOptions).toHaveBeenCalled());
    expect(screen.queryByText(/On the market now/)).toBeNull();
  });
});
