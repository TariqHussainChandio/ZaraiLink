import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { FilterBar } from './FilterBar';
import type { Category } from '../types/marketplace';

jest.mock('../services/listingsService', () => ({
  fetchCrops: jest.fn().mockResolvedValue([]),
  fetchCategories: jest.fn().mockResolvedValue([]),
}));

const categories: Category[] = [
  {
    id: 'c1',
    name: 'Seeds',
    icon: null,
    created_at: '',
    updated_at: '',
  } as unknown as Category,
  {
    id: 'c2',
    name: 'Fertilizers',
    icon: null,
    created_at: '',
    updated_at: '',
  } as unknown as Category,
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

describe('FilterBar', () => {
  it('renders the search input and all category chips including "All"', async () => {
    await renderWithQuery(<FilterBar {...baseProps} />);
    expect(screen.getByPlaceholderText('Search listings...')).toBeTruthy();
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('Seeds')).toBeTruthy();
    expect(screen.getByText('Fertilizers')).toBeTruthy();
  });

  it('calls onSearchChange as the user types', async () => {
    const onSearchChange = jest.fn();
    await renderWithQuery(
      <FilterBar {...baseProps} onSearchChange={onSearchChange} />,
    );
    fireEvent.changeText(
      screen.getByPlaceholderText('Search listings...'),
      'urea',
    );
    expect(onSearchChange).toHaveBeenCalledWith('urea');
  });

  it('calls onSelectCategory when a category chip is tapped', async () => {
    const onSelectCategory = jest.fn();
    await renderWithQuery(
      <FilterBar {...baseProps} onSelectCategory={onSelectCategory} />,
    );
    fireEvent.press(screen.getByText('Seeds'));
    expect(onSelectCategory).toHaveBeenCalledWith('c1');
  });

  it('shows the active filter count badge when more filters are applied', async () => {
    await renderWithQuery(
      <FilterBar {...baseProps} minPrice={100} city="Lahore" />,
    );
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('opens the filter sheet and applies price filters', async () => {
    const onApplyMoreFilters = jest.fn();
    await renderWithQuery(
      <FilterBar {...baseProps} onApplyMoreFilters={onApplyMoreFilters} />,
    );
    await fireEvent.press(screen.getByLabelText('Filters'));
    expect(await screen.findByText('Filters')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('filter-min-price'), '100');
    await fireEvent.changeText(screen.getByTestId('filter-max-price'), '500');
    fireEvent.press(screen.getByText('Apply Filters'));
    expect(onApplyMoreFilters).toHaveBeenCalledWith({
      minPrice: 100,
      maxPrice: 500,
      city: null,
      cropName: null,
    });
  });

  it('clears all filters when Clear Filters is pressed', async () => {
    const onApplyMoreFilters = jest.fn();
    await renderWithQuery(
      <FilterBar
        {...baseProps}
        minPrice={100}
        maxPrice={500}
        onApplyMoreFilters={onApplyMoreFilters}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Filters, 2 active'));
    fireEvent.press(await screen.findByText('Clear Filters'));
    expect(onApplyMoreFilters).toHaveBeenCalledWith({
      minPrice: null,
      maxPrice: null,
      city: null,
      cropName: null,
    });
  });
});
