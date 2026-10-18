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
import { useAuthStore } from '../../state/authStore';
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
  useAuthStore.setState({ user: { id: 'admin-1' } as never });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** The sheet's button: it renders after the card's button of the same name, so it is the last match. */
function sheetButton(label: string) {
  const matches = screen.getAllByText(label);
  const last = matches[matches.length - 1];
  if (!last) throw new Error(`No "${label}" button`);
  return last;
}

describe('CategoryManagementScreen', () => {
  it('shows an empty state when there are no categories', async () => {
    mockFetchCategories.mockResolvedValue([]);
    await renderWithQuery(<CategoryManagementScreen />);
    expect(await screen.findByText('No categories yet')).toBeTruthy();
  });

  it('lists categories with their slug', async () => {
    mockFetchCategories.mockResolvedValue([category()]);
    await renderWithQuery(<CategoryManagementScreen />);
    expect(await screen.findByText('Seeds')).toBeTruthy();
    expect(screen.getByText('seeds')).toBeTruthy();
  });

  it('creates a new category through the sheet', async () => {
    mockFetchCategories.mockResolvedValue([]);
    mockCreateCategory.mockResolvedValue(category());
    await renderWithQuery(<CategoryManagementScreen />);
    await screen.findByText('No categories yet');

    await fireEvent.press(screen.getByText('+ Add Category'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Fertilizers');
    await fireEvent.changeText(screen.getByLabelText('Slug'), 'fertilizers');
    mockFetchCategories.mockResolvedValue([category({ id: 'cat-2', name: 'Fertilizers', slug: 'fertilizers' })]);
    await fireEvent.press(screen.getByText('Create Category'));

    expect(mockCreateCategory).toHaveBeenCalledWith({ name: 'Fertilizers', slug: 'fertilizers', icon: null });
    expect(await screen.findByText('Fertilizers')).toBeTruthy();
  });

  it('edits an existing category, prefilling the sheet', async () => {
    mockFetchCategories.mockResolvedValue([category()]);
    mockUpdateCategory.mockResolvedValue(category({ name: 'Seeds & Saplings' }));
    await renderWithQuery(<CategoryManagementScreen />);
    await screen.findByText('Seeds');

    await fireEvent.press(screen.getByText('Edit'));
    expect(screen.getByLabelText('Name').props.value).toBe('Seeds');

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Seeds & Saplings');
    await fireEvent.press(screen.getByText('Save Changes'));

    expect(mockUpdateCategory).toHaveBeenCalledWith('cat-1', {
      name: 'Seeds & Saplings',
      slug: 'seeds',
      icon: 'sprout',
    });
  });

  it('deletes a category only after confirming in the sheet', async () => {
    mockFetchCategories.mockResolvedValue([category()]);
    mockDeleteCategory.mockResolvedValue(undefined);
    await renderWithQuery(<CategoryManagementScreen />);
    await screen.findByText('Seeds');

    await fireEvent.press(screen.getByText('Delete'));
    expect(await screen.findByText('Delete "Seeds"? This cannot be undone.')).toBeTruthy();
    expect(mockDeleteCategory).not.toHaveBeenCalled();

    await fireEvent.press(sheetButton('Delete'));

    expect(mockDeleteCategory).toHaveBeenCalledWith('cat-1');
    expect(await screen.findByText('Category deleted')).toBeTruthy();
  });

  it('cancelling the confirmation deletes nothing', async () => {
    mockFetchCategories.mockResolvedValue([category()]);
    await renderWithQuery(<CategoryManagementScreen />);
    await screen.findByText('Seeds');

    await fireEvent.press(screen.getByText('Delete'));
    await fireEvent.press(await screen.findByText('Cancel'));

    expect(screen.queryByText('Delete "Seeds"? This cannot be undone.')).toBeNull();
    expect(mockDeleteCategory).not.toHaveBeenCalled();
  });
});
