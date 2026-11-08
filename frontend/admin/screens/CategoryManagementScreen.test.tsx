import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { CategoryManagementScreen } from './CategoryManagementScreen';
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
} from '../../common/marketplace/services/listingsService';
import type { Category } from '../../common/marketplace/types/marketplace';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) =>
      useEffect(() => {
        effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []),
  };
});

jest.mock('../../common/marketplace/services/listingsService', () => ({
  fetchCategories: jest.fn(),
  createCategory: jest.fn(),
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
}));

const mockFetchCategories = fetchCategories as jest.Mock;
const mockCreateCategory = createCategory as jest.Mock;
const mockUpdateCategory = updateCategory as jest.Mock;
const mockDeleteCategory = deleteCategory as jest.Mock;

const category = (overrides: Partial<Category> = {}): Category => ({
  id: 'cat-1',
  name: 'Seeds',
  slug: 'seeds',
  icon: 'sprout',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  mockFetchCategories.mockReset();
  mockCreateCategory.mockReset();
  mockUpdateCategory.mockReset();
  mockDeleteCategory.mockReset();
});

describe('CategoryManagementScreen', () => {
  it('shows an empty state when there are no categories', async () => {
    mockFetchCategories.mockResolvedValue([]);
    await renderWithQuery(<CategoryManagementScreen />);
    expect(await screen.findByText('No categories yet')).toBeTruthy();
  });

  it('says the load failed, and retries, instead of an empty list (AD-11)', async () => {
    mockFetchCategories.mockRejectedValueOnce(new Error('boom'));
    await renderWithQuery(<CategoryManagementScreen />);
    expect(await screen.findByText("Couldn't load categories")).toBeTruthy();
    expect(screen.queryByText('No categories yet')).toBeNull();

    mockFetchCategories.mockResolvedValueOnce([category()]);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Seeds')).toBeTruthy();
  });

  it('lists categories by name only, without the system slug', async () => {
    mockFetchCategories.mockResolvedValue([category()]);
    await renderWithQuery(<CategoryManagementScreen />);
    expect(await screen.findByText('Seeds')).toBeTruthy();
    expect(screen.queryByText('seeds')).toBeNull();
  });

  it('creates a category from its name alone: the slug is made from it and there is no icon field (AD-15)', async () => {
    mockFetchCategories.mockResolvedValue([]);
    mockCreateCategory.mockResolvedValue(category());
    await renderWithQuery(<CategoryManagementScreen />);
    await screen.findByText('No categories yet');

    await fireEvent.press(screen.getByRole('button', { name: 'Add a category' }));
    expect(screen.queryByLabelText('Slug')).toBeNull();
    expect(screen.queryByLabelText(/Icon/)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Farm Tools & Sprayers');
    mockFetchCategories.mockResolvedValue([category({ id: 'cat-2', name: 'Farm Tools & Sprayers', slug: 'farm-tools-sprayers' })]);
    await fireEvent.press(screen.getByRole('button', { name: 'Add category' }));

    expect(mockCreateCategory).toHaveBeenCalledWith({ name: 'Farm Tools & Sprayers', slug: 'farm-tools-sprayers', icon: null });
    expect(await screen.findByText('Farm Tools & Sprayers')).toBeTruthy();
  });

  it('says what is wrong beside the field instead of doing nothing', async () => {
    mockFetchCategories.mockResolvedValue([]);
    await renderWithQuery(<CategoryManagementScreen />);
    await screen.findByText('No categories yet');

    await fireEvent.press(screen.getByRole('button', { name: 'Add a category' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add category' }));
    expect(await screen.findByText('Give the category a name of at least 2 letters')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Name'), 'بیج');
    await fireEvent.press(screen.getByRole('button', { name: 'Add category' }));
    expect(await screen.findByText('Use letters or numbers in the name')).toBeTruthy();
    expect(mockCreateCategory).not.toHaveBeenCalled();
  });

  it('keeps the sheet open and shows the reason when the server refuses', async () => {
    mockFetchCategories.mockResolvedValue([]);
    mockCreateCategory.mockRejectedValue(new Error('conflict'));
    await renderWithQuery(<CategoryManagementScreen />);
    await screen.findByText('No categories yet');

    await fireEvent.press(screen.getByRole('button', { name: 'Add a category' }));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Seeds');
    await fireEvent.press(screen.getByRole('button', { name: 'Add category' }));

    expect(await screen.findByText("Couldn't save the category")).toBeTruthy();
    expect(screen.getByLabelText('Name').props.value).toBe('Seeds');
  });

  it('renames a category and keeps its slug and icon', async () => {
    mockFetchCategories.mockResolvedValue([category()]);
    mockUpdateCategory.mockResolvedValue(category({ name: 'Seeds and saplings' }));
    await renderWithQuery(<CategoryManagementScreen />);

    await fireEvent.press(await screen.findByText('Seeds'));
    await fireEvent.press(await screen.findByText('Rename category'));
    expect(screen.getByLabelText('Name').props.value).toBe('Seeds');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Seeds and saplings');
    await fireEvent.press(screen.getByRole('button', { name: 'Save category' }));

    expect(mockUpdateCategory).toHaveBeenCalledWith('cat-1', { name: 'Seeds and saplings', slug: 'seeds', icon: 'sprout' });
  });

  it('deletes a category only after a confirmation that names it', async () => {
    mockFetchCategories.mockResolvedValue([category()]);
    mockDeleteCategory.mockResolvedValue(undefined);
    await renderWithQuery(<CategoryManagementScreen />);

    await fireEvent.press(await screen.findByText('Seeds'));
    await fireEvent.press(await screen.findByText('Delete Seeds'));
    expect(await screen.findByText('Delete Seeds?')).toBeTruthy();
    expect(mockDeleteCategory).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Delete Seeds' }));

    expect(mockDeleteCategory).toHaveBeenCalledWith('cat-1');
    expect(await screen.findByText('Seeds deleted')).toBeTruthy();
  });
});
