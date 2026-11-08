import React from 'react';
import { Text } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { FilterBar } from './FilterBar';
import type { Category } from '../types/marketplace';

jest.mock('../services/listingsService', () => ({
  fetchCrops: jest.fn().mockResolvedValue([{ id: 'crop1', name: 'Wheat', category: null }]),
  fetchCategories: jest.fn().mockResolvedValue([]),
}));

const categories: Category[] = [
  { id: 'c1', name: 'Seeds', icon: null, created_at: '', updated_at: '' } as unknown as Category,
  { id: 'c2', name: 'Fertilizers', icon: null, created_at: '', updated_at: '' } as unknown as Category,
];

const baseProps = {
  search: '',
  onSearchChange: jest.fn(),
  categories,
  selectedCategoryId: null,
  onSelectCategory: jest.fn(),
  minPrice: null,
  maxPrice: null,
  city: null,
  cropName: null,
  onApplyMoreFilters: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('FilterBar', () => {
  it('renders the search input and all category chips including "All"', async () => {
    await renderWithQuery(<FilterBar {...baseProps} />);
    expect(screen.getByLabelText('Search the market')).toBeTruthy();
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('Seeds')).toBeTruthy();
    expect(screen.getByText('Fertilizers')).toBeTruthy();
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

  it('calls onSelectCategory with the id, and with null for All', async () => {
    const onSelectCategory = jest.fn();
    await renderWithQuery(<FilterBar {...baseProps} selectedCategoryId="c1" onSelectCategory={onSelectCategory} />);
    await fireEvent.press(screen.getByText('Fertilizers'));
    expect(onSelectCategory).toHaveBeenCalledWith('c2');
    await fireEvent.press(screen.getByText('All'));
    expect(onSelectCategory).toHaveBeenCalledWith(null);
  });

  it('counts the filters in force on the Filters button and shows a removable chip for each', async () => {
    const onApplyMoreFilters = jest.fn();
    await renderWithQuery(<FilterBar {...baseProps} minPrice={100} city="Lahore" onApplyMoreFilters={onApplyMoreFilters} />);
    expect(screen.getByLabelText('Filters, 2 on')).toBeTruthy();
    expect(screen.getByText('From Rs 100')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove filter: Lahore' }));
    expect(onApplyMoreFilters).toHaveBeenCalledWith({ minPrice: 100, maxPrice: null, city: null, cropName: null });
  });

  it('opens a titled filter sheet with price, city and crop, and no country or province', async () => {
    await renderWithQuery(<FilterBar {...baseProps} />);
    await fireEvent.press(screen.getByLabelText('Filters'));
    expect(await screen.findByRole('header', { name: 'Filters' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close Filters' })).toBeTruthy();
    expect(screen.getByText('City')).toBeTruthy();
    expect(await screen.findByText('Wheat')).toBeTruthy();
    expect(screen.queryByText('Province')).toBeNull();
    expect(screen.queryByText('Country')).toBeNull();
  });

  it('applies price, city and crop', async () => {
    const onApplyMoreFilters = jest.fn();
    await renderWithQuery(<FilterBar {...baseProps} onApplyMoreFilters={onApplyMoreFilters} />);
    await fireEvent.press(screen.getByLabelText('Filters'));
    await fireEvent.changeText(await screen.findByTestId('filter-min-price'), '100');
    await fireEvent.changeText(screen.getByTestId('filter-max-price'), '500');
    await fireEvent.changeText(screen.getByLabelText('City'), ' Okara ');
    await fireEvent.press(await screen.findByText('Wheat'));
    await fireEvent.press(screen.getByText('Show results'));
    expect(onApplyMoreFilters).toHaveBeenCalledWith({ minPrice: 100, maxPrice: 500, city: 'Okara', cropName: 'Wheat' });
  });

  it('reads "1,000" as 1000, never as NaN (MK-10)', async () => {
    const onApplyMoreFilters = jest.fn();
    await renderWithQuery(<FilterBar {...baseProps} onApplyMoreFilters={onApplyMoreFilters} />);
    await fireEvent.press(screen.getByLabelText('Filters'));
    await fireEvent.changeText(await screen.findByTestId('filter-max-price'), '1,000');
    await fireEvent.press(screen.getByText('Show results'));
    expect(onApplyMoreFilters).toHaveBeenCalledWith({ minPrice: null, maxPrice: 1000, city: null, cropName: null });
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

  it('clears every filter from the sheet', async () => {
    const onApplyMoreFilters = jest.fn();
    await renderWithQuery(<FilterBar {...baseProps} minPrice={100} maxPrice={500} onApplyMoreFilters={onApplyMoreFilters} />);
    await fireEvent.press(screen.getByLabelText('Filters, 2 on'));
    await fireEvent.press(await screen.findByText('Clear filters'));
    expect(onApplyMoreFilters).toHaveBeenCalledWith({ minPrice: null, maxPrice: null, city: null, cropName: null });
  });
});
