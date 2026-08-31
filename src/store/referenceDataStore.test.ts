import { act } from '@testing-library/react-native';
import { fetchCurrencies, fetchUnits } from '../services/modules/reference-data/referenceDataService';
import { useReferenceDataStore } from './referenceDataStore';

jest.mock('../services/modules/reference-data/referenceDataService');

const mockFetchCurrencies = fetchCurrencies as jest.MockedFunction<typeof fetchCurrencies>;
const mockFetchUnits = fetchUnits as jest.MockedFunction<typeof fetchUnits>;

beforeEach(() => {
  jest.clearAllMocks();
  act(() => {
    useReferenceDataStore.setState({
      currencies: [],
      currenciesLoaded: false,
      units: [],
      unitsLoaded: false,
    });
  });
});

describe('useReferenceDataStore.loadCurrencies', () => {
  it('fetches and stores currencies on first call, then caches', async () => {
    const currencies = [{ id: 'cur-1', code: 'PKR', symbol: 'Rs.', name: 'Pakistani Rupee' }];
    mockFetchCurrencies.mockResolvedValue(currencies as never);

    await act(async () => {
      await useReferenceDataStore.getState().loadCurrencies();
      await useReferenceDataStore.getState().loadCurrencies();
    });

    expect(mockFetchCurrencies).toHaveBeenCalledTimes(1);
    expect(useReferenceDataStore.getState().currencies).toEqual(currencies);
    expect(useReferenceDataStore.getState().currenciesLoaded).toBe(true);
  });
});

describe('useReferenceDataStore.loadUnits', () => {
  it('fetches and stores units on first call, then caches', async () => {
    const units = [{ id: 'unit-1', code: 'kg', label: 'Kilogram', applies_to: 'weight' }];
    mockFetchUnits.mockResolvedValue(units as never);

    await act(async () => {
      await useReferenceDataStore.getState().loadUnits();
      await useReferenceDataStore.getState().loadUnits();
    });

    expect(mockFetchUnits).toHaveBeenCalledTimes(1);
    expect(useReferenceDataStore.getState().units).toEqual(units);
    expect(useReferenceDataStore.getState().unitsLoaded).toBe(true);
  });
});

describe('useReferenceDataStore.invalidateAll', () => {
  it('resets both currencies and units so the next load re-fetches', async () => {
    mockFetchCurrencies.mockResolvedValue([{ id: 'cur-1' }] as never);
    mockFetchUnits.mockResolvedValue([{ id: 'unit-1' }] as never);

    await act(async () => {
      await useReferenceDataStore.getState().loadCurrencies();
      await useReferenceDataStore.getState().loadUnits();
      useReferenceDataStore.getState().invalidateAll();
    });

    expect(useReferenceDataStore.getState()).toMatchObject({
      currencies: [],
      currenciesLoaded: false,
      units: [],
      unitsLoaded: false,
    });

    await act(async () => {
      await useReferenceDataStore.getState().loadCurrencies();
      await useReferenceDataStore.getState().loadUnits();
    });

    expect(mockFetchCurrencies).toHaveBeenCalledTimes(2);
    expect(mockFetchUnits).toHaveBeenCalledTimes(2);
  });
});
