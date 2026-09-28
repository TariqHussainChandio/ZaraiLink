import { apiFetch } from '../../../services/api/client';
import {
  createRefDataRow,
  deleteRefDataRow,
  fetchCurrencies,
  fetchRefDataRows,
  fetchUnits,
  updateRefDataRow,
} from './referenceDataService';

jest.mock('../../../services/api/client');

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchCurrencies / fetchUnits', () => {
  it('fetches currencies', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchCurrencies();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reference-data/currencies');
  });

  it('fetches units', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchUnits();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reference-data/units');
  });
});

describe('fetchRefDataRows', () => {
  it('fetches unfiltered rows for the given table', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchRefDataRows('currencies');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reference-data/currencies/rows');
  });
});

describe('createRefDataRow / updateRefDataRow / deleteRefDataRow', () => {
  it('POSTs a new row', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await createRefDataRow('units', { code: 'kg', label: 'Kilogram' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reference-data/units/rows', {
      method: 'POST',
      body: { code: 'kg', label: 'Kilogram' },
    });
  });

  it('PATCHes an existing row', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await updateRefDataRow('units', 'unit-1', { label: 'Kilograms' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reference-data/units/rows/unit-1', {
      method: 'PATCH',
      body: { label: 'Kilograms' },
    });
  });

  it('DELETEs a row', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await deleteRefDataRow('currencies', 'cur-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reference-data/currencies/rows/cur-1', {
      method: 'DELETE',
    });
  });
});
