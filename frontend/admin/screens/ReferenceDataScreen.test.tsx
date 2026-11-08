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

const PKR = { id: 'cur-1', code: 'PKR', symbol: 'Rs', name: 'Pakistani rupee' };

beforeEach(() => {
  mockFetchRows.mockReset();
  mockCreateRow.mockReset();
  mockUpdateRow.mockReset();
  mockDeleteRow.mockReset();
  queryClient.clear();
  jest.spyOn(queryClient, 'invalidateQueries');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ReferenceDataScreen', () => {
  it('loads currencies by default', async () => {
    mockFetchRows.mockResolvedValue([PKR]);
    await renderWithQuery(<ReferenceDataScreen />, queryClient);

    expect(await screen.findByText('PKR — Pakistani rupee')).toBeTruthy();
    expect(mockFetchRows).toHaveBeenCalledWith('currencies');
  });

  it('shows an empty state when a table has no rows', async () => {
    mockFetchRows.mockResolvedValue([]);
    await renderWithQuery(<ReferenceDataScreen />, queryClient);
    expect(await screen.findByText('No currencies yet')).toBeTruthy();
  });

  it('says the load failed, and retries, instead of an empty list (AD-11)', async () => {
    mockFetchRows.mockRejectedValueOnce(new Error('boom'));
    await renderWithQuery(<ReferenceDataScreen />, queryClient);
    expect(await screen.findByText("Couldn't load currencies")).toBeTruthy();
    expect(screen.queryByText('No currencies yet')).toBeNull();

    mockFetchRows.mockResolvedValueOnce([PKR]);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('PKR — Pakistani rupee')).toBeTruthy();
  });

  it('switches to the units table and reloads', async () => {
    mockFetchRows.mockImplementation((table: string) =>
      Promise.resolve(table === 'units' ? [{ id: 'unit-1', code: 'kg', label: 'Kilogram', applies_to: 'weight' }] : []),
    );
    await renderWithQuery(<ReferenceDataScreen />, queryClient);
    await screen.findByText('No currencies yet');

    await fireEvent.press(screen.getByRole('button', { name: 'Units' }));

    expect(mockFetchRows).toHaveBeenLastCalledWith('units');
    expect(await screen.findByText('Kilogram')).toBeTruthy();
    expect(screen.getByText('weight')).toBeTruthy();
  });

  it('names the entry in the singular: "Add a currency", never "Currencie" (AD-15)', async () => {
    mockFetchRows.mockResolvedValue([]);
    await renderWithQuery(<ReferenceDataScreen />, queryClient);
    await screen.findByText('No currencies yet');

    expect(screen.getByRole('button', { name: 'Add a currency' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add a currency' }));
    expect(await screen.findByText('New currency')).toBeTruthy();
    expect(screen.queryByText(/Currencie\b/)).toBeNull();
  });

  it('creates a new currency row through the sheet', async () => {
    mockFetchRows.mockResolvedValue([]);
    mockCreateRow.mockResolvedValue(undefined);
    await renderWithQuery(<ReferenceDataScreen />, queryClient);
    await screen.findByText('No currencies yet');

    await fireEvent.press(screen.getByRole('button', { name: 'Add a currency' }));
    await fireEvent.changeText(screen.getByLabelText('Code'), 'USD');
    await fireEvent.changeText(screen.getByLabelText('Symbol'), '$');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'US dollar');
    mockFetchRows.mockResolvedValue([{ id: 'cur-2', code: 'USD', symbol: '$', name: 'US dollar' }]);
    await fireEvent.press(screen.getByRole('button', { name: 'Add currency' }));

    expect(mockCreateRow).toHaveBeenCalledWith('currencies', { code: 'USD', symbol: '$', name: 'US dollar' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.referenceData.all });
    expect(await screen.findByText('USD — US dollar')).toBeTruthy();
  });

  it('says which field is empty beside it, and does not save', async () => {
    mockFetchRows.mockResolvedValue([]);
    await renderWithQuery(<ReferenceDataScreen />, queryClient);
    await screen.findByText('No currencies yet');

    await fireEvent.press(screen.getByRole('button', { name: 'Add a currency' }));
    await fireEvent.changeText(screen.getByLabelText('Code'), 'USD');
    await fireEvent.press(screen.getByRole('button', { name: 'Add currency' }));

    expect(await screen.findByText('Enter the symbol')).toBeTruthy();
    expect(screen.getByText('Enter the name')).toBeTruthy();
    expect(mockCreateRow).not.toHaveBeenCalled();
  });

  it('edits an existing row', async () => {
    mockFetchRows.mockResolvedValue([PKR]);
    mockUpdateRow.mockResolvedValue(undefined);
    await renderWithQuery(<ReferenceDataScreen />, queryClient);

    await fireEvent.press(await screen.findByText('PKR — Pakistani rupee'));
    await fireEvent.press(await screen.findByText('Edit currency'));
    expect(screen.getByLabelText('Code').props.value).toBe('PKR');

    await fireEvent.changeText(screen.getByLabelText('Symbol'), 'PKR');
    await fireEvent.press(screen.getByRole('button', { name: 'Save currency' }));

    expect(mockUpdateRow).toHaveBeenCalledWith('currencies', 'cur-1', { code: 'PKR', symbol: 'PKR', name: 'Pakistani rupee' });
  });

  it('deletes a row only after a confirmation that names it', async () => {
    mockFetchRows.mockResolvedValue([PKR]);
    mockDeleteRow.mockResolvedValue(undefined);
    await renderWithQuery(<ReferenceDataScreen />, queryClient);

    await fireEvent.press(await screen.findByText('PKR — Pakistani rupee'));
    await fireEvent.press(await screen.findByText('Delete currency'));
    expect(await screen.findByText('Delete PKR — Pakistani rupee?')).toBeTruthy();
    expect(mockDeleteRow).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Delete currency' }));

    expect(mockDeleteRow).toHaveBeenCalledWith('currencies', 'cur-1');
  });
});
