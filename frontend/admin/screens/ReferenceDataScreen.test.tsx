import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../testUtils/renderWithProviders';
import { queryKeys } from '../../hooks/keys';
import { ReferenceDataScreen } from './ReferenceDataScreen';
import {
  createRefDataRow,
  deleteRefDataRow,
  fetchRefDataRows,
  updateRefDataRow,
} from '../../common/reference-data/services/referenceDataService';
import { useAuthStore } from '../../state/authStore';

const queryClient = createTestQueryClient();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    // Depends on the effect's own identity (like react-navigation's real hook) rather than `[]`
    // so the reload triggered by switching the currencies/units table filter is exercised.
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('../../common/reference-data/services/referenceDataService', () => ({
  fetchRefDataRows: jest.fn(),
  createRefDataRow: jest.fn(),
  updateRefDataRow: jest.fn(),
  deleteRefDataRow: jest.fn(),
}));

const mockFetchRows = fetchRefDataRows as jest.Mock;
const mockCreateRow = createRefDataRow as jest.Mock;
const mockUpdateRow = updateRefDataRow as jest.Mock;
const mockDeleteRow = deleteRefDataRow as jest.Mock;

beforeEach(() => {
  mockFetchRows.mockReset();
  mockCreateRow.mockReset();
  mockUpdateRow.mockReset();
  mockDeleteRow.mockReset();
  useAuthStore.setState({ user: { id: 'admin-1' } as never });
  queryClient.clear();
  jest.spyOn(queryClient, 'invalidateQueries');
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

describe('ReferenceDataScreen', () => {
  it('loads currencies by default', async () => {
    mockFetchRows.mockResolvedValue([{ id: 'cur-1', code: 'PKR', symbol: 'Rs.', name: 'Pakistani Rupee' }]);
    await renderWithQuery(<ReferenceDataScreen />, queryClient);

    expect(await screen.findByText('PKR — Pakistani Rupee')).toBeTruthy();
    expect(mockFetchRows).toHaveBeenCalledWith('currencies');
  });

  it('shows an empty state when a table has no rows', async () => {
    mockFetchRows.mockResolvedValue([]);
    await renderWithQuery(<ReferenceDataScreen />, queryClient);
    expect(await screen.findByText('No currencies yet')).toBeTruthy();
  });

  it('switches to the units table and reloads', async () => {
    mockFetchRows.mockImplementation((table: string) =>
      Promise.resolve(
        table === 'units' ? [{ id: 'unit-1', code: 'kg', label: 'Kilogram', applies_to: 'weight' }] : [],
      ),
    );
    await renderWithQuery(<ReferenceDataScreen />, queryClient);
    await screen.findByText('No currencies yet');

    await fireEvent.press(screen.getByText('Units'));

    expect(mockFetchRows).toHaveBeenLastCalledWith('units');
    expect(await screen.findByText('Kilogram')).toBeTruthy();
    expect(screen.getByText('weight')).toBeTruthy();
  });

  it('creates a new currency row through the sheet', async () => {
    mockFetchRows.mockResolvedValue([]);
    mockCreateRow.mockResolvedValue(undefined);
    await renderWithQuery(<ReferenceDataScreen />, queryClient);
    await screen.findByText('No currencies yet');

    await fireEvent.press(screen.getByText('+ Add Currency'));
    await fireEvent.changeText(screen.getByLabelText('Code'), 'USD');
    await fireEvent.changeText(screen.getByLabelText('Symbol'), '$');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'US Dollar');
    mockFetchRows.mockResolvedValue([{ id: 'cur-2', code: 'USD', symbol: '$', name: 'US Dollar' }]);
    await fireEvent.press(screen.getByText('Create'));

    expect(mockCreateRow).toHaveBeenCalledWith('currencies', { code: 'USD', symbol: '$', name: 'US Dollar' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.referenceData.all });
    expect(await screen.findByText('USD — US Dollar')).toBeTruthy();
  });

  it('edits an existing row', async () => {
    mockFetchRows.mockResolvedValue([{ id: 'cur-1', code: 'PKR', symbol: 'Rs.', name: 'Pakistani Rupee' }]);
    mockUpdateRow.mockResolvedValue(undefined);
    await renderWithQuery(<ReferenceDataScreen />, queryClient);
    await screen.findByText('PKR — Pakistani Rupee');

    await fireEvent.press(screen.getByText('Edit'));
    expect(screen.getByLabelText('Code').props.value).toBe('PKR');

    await fireEvent.changeText(screen.getByLabelText('Symbol'), 'PKR');
    await fireEvent.press(screen.getByText('Save Changes'));

    expect(mockUpdateRow).toHaveBeenCalledWith('currencies', 'cur-1', {
      code: 'PKR',
      symbol: 'PKR',
      name: 'Pakistani Rupee',
    });
  });

  it('deletes a row only after confirming in the sheet', async () => {
    mockFetchRows.mockResolvedValue([{ id: 'cur-1', code: 'PKR', symbol: 'Rs.', name: 'Pakistani Rupee' }]);
    mockDeleteRow.mockResolvedValue(undefined);
    await renderWithQuery(<ReferenceDataScreen />, queryClient);
    await screen.findByText('PKR — Pakistani Rupee');

    await fireEvent.press(screen.getByText('Delete'));
    // The row's button only opens the confirmation; nothing is deleted yet.
    expect(await screen.findByText('Delete "PKR — Pakistani Rupee"? This cannot be undone.')).toBeTruthy();
    expect(mockDeleteRow).not.toHaveBeenCalled();

    await fireEvent.press(sheetButton('Delete'));

    expect(mockDeleteRow).toHaveBeenCalledWith('currencies', 'cur-1');
    expect(await screen.findByText('Entry deleted')).toBeTruthy();
  });

  it('cancelling the confirmation deletes nothing', async () => {
    mockFetchRows.mockResolvedValue([{ id: 'cur-1', code: 'PKR', symbol: 'Rs.', name: 'Pakistani Rupee' }]);
    await renderWithQuery(<ReferenceDataScreen />, queryClient);
    await screen.findByText('PKR — Pakistani Rupee');

    await fireEvent.press(screen.getByText('Delete'));
    await fireEvent.press(await screen.findByText('Cancel'));

    expect(screen.queryByText('Delete "PKR — Pakistani Rupee"? This cannot be undone.')).toBeNull();
    expect(mockDeleteRow).not.toHaveBeenCalled();
  });
});
