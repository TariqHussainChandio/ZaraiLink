import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { useForm } from 'react-hook-form';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { Text } from 'react-native';
import { fetchLinkableInventoryProducts } from '../services/inventoryProductsService';
import { useAuthStore } from '../../../state/authStore';
import {
  ListingFormFields,
  listingFormDefaults,
  listingSchema,
  type ListingFormInput,
  type ListingFormValues,
} from './ListingFormFields';

jest.mock('../services/listingsService', () => ({
  fetchCategories: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Seeds', slug: 'seeds', icon: null, created_at: '' }]),
  fetchCrops: jest.fn().mockResolvedValue([{ id: 'crop1', name: 'Wheat', category: null }]),
}));
jest.mock('../../reference-data/services/referenceDataService', () => ({
  fetchUnits: jest.fn().mockResolvedValue([
    { id: 'u1', code: 'kg', label: 'Kilogram', applies_to: 'weight' },
    { id: 'u2', code: 'bag', label: 'Bag', applies_to: 'quantity' },
    { id: 'u3', code: 'acre', label: 'Acre', applies_to: 'area' },
  ]),
}));
jest.mock('../services/inventoryProductsService', () => ({
  fetchLinkableInventoryProducts: jest.fn(),
}));

const mockFetchProducts = fetchLinkableInventoryProducts as jest.Mock;

beforeEach(() => {
  mockFetchProducts.mockReset().mockResolvedValue([
    { id: 'product-1', sku: 'UREA-1', name: 'Urea', unit: 'bag', is_active: true },
    { id: 'product-old', sku: 'OLD-1', name: 'Old stock', unit: 'bag', is_active: false },
  ]);
  useAuthStore.setState({ profile: { role: 'farmer', account_status: 'approved' } as never });
});

/** The form, plus the linked product's current value as text, so a test can see what a pick wrote. */
function Harness({ defaults = listingFormDefaults, onValues }: { defaults?: ListingFormInput; onValues?: (values: ListingFormInput) => void }) {
  const {
    control,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ListingFormInput, any, ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: defaults,
  });
  onValues?.(watch());
  const linked = watch('inventoryProductId');
  return (
    <>
      <ListingFormFields control={control} errors={errors} setValue={setValue} watch={watch} />
      <Text testID="linked-value">{linked ?? 'null'}</Text>
    </>
  );
}

describe('ListingFormFields', () => {
  it('renders the core fields with one label style, and marks the optional ones with the field, not in the label', async () => {
    await renderWithQuery(<Harness />);
    expect(screen.getByText('Name of the product')).toBeTruthy();
    expect(screen.getByText('Category')).toBeTruthy();
    expect(screen.getByText('Sold by')).toBeTruthy();
    expect(screen.getByText('Price')).toBeTruthy();
    expect(screen.getByText('Quantity available')).toBeTruthy();
    expect(screen.queryByText(/\(optional\)/)).toBeNull();
    // Description, brand and condition each carry the field's own "Optional" mark.
    expect(screen.getAllByText('Optional')).toHaveLength(3);
  });

  it('starts price and quantity empty, not as a visible 0 (MK-09)', async () => {
    await renderWithQuery(<Harness />);
    expect(screen.getByLabelText('Price').props.value).toBe('');
    expect(screen.getByLabelText('Quantity available').props.value).toBe('');
  });

  it('prefixes the price with Rs and names the unit it is per', async () => {
    await renderWithQuery(<Harness defaults={{ ...listingFormDefaults, unit: 'bag' }} />);
    expect(screen.getByText('Rs')).toBeTruthy();
    expect(screen.getAllByText('per bag').length).toBeGreaterThan(0);
  });

  it('offers units from the reference list, without area units, instead of free text', async () => {
    await renderWithQuery(<Harness />);
    await fireEvent.press(await screen.findByRole('button', { name: /Sold by/ }));
    expect(await screen.findByText('Kilogram (kg)', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('Bag (bag)')).toBeTruthy();
    expect(screen.queryByText('Acre (acre)')).toBeNull();
  });

  it('keeps a unit saved before the list existed, so it does not read as nothing chosen', async () => {
    await renderWithQuery(<Harness defaults={{ ...listingFormDefaults, unit: '40kg bag' }} />);
    expect(await screen.findByText('40kg bag', {}, { timeout: 3000 })).toBeTruthy();
  });

  it('keeps only the digits typed into price and quantity: "1,500" is 1500', async () => {
    let seen: ListingFormInput = listingFormDefaults;
    await renderWithQuery(<Harness onValues={values => (seen = values)} />);
    await fireEvent.changeText(screen.getByLabelText('Price'), 'Rs 1,500');
    await fireEvent.changeText(screen.getByLabelText('Quantity available'), '4 0');
    expect(seen.price).toBe('1500');
    expect(seen.quantity).toBe('40');
  });

  it('shows the crop chips once crops load, and toggles selection', async () => {
    await renderWithQuery(<Harness />);
    await fireEvent.press(await screen.findByText('Wheat'));
    expect(screen.getByText('Wheat').parent?.props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByText('Wheat'));
    expect(screen.getByText('Wheat').parent?.props.accessibilityState.selected).toBe(false);
  });

  // D8: the linked inventory product picker.
  it('offers an approved dealer their active products, and writes the pick or null for None', async () => {
    useAuthStore.setState({ profile: { role: 'dealer', account_status: 'approved' } as never });
    await renderWithQuery(<Harness />);

    const field = await screen.findByRole('button', { name: 'Linked inventory product, None' });
    expect(screen.getByText('Optional. Stock for this listing then comes from your inventory.')).toBeTruthy();
    await fireEvent.press(field);
    expect(screen.queryByText('Old stock · OLD-1', { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(await screen.findByRole('button', { name: 'Urea · UREA-1', includeHiddenElements: true }));
    expect(screen.getByTestId('linked-value').props.children).toBe('product-1');

    await fireEvent.press(screen.getByRole('button', { name: 'Linked inventory product, Urea · UREA-1' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'None', includeHiddenElements: true }));
    expect(screen.getByTestId('linked-value').props.children).toBe('null');
  });

  it('tells the dealer when their products could not be loaded', async () => {
    useAuthStore.setState({ profile: { role: 'dealer', account_status: 'approved' } as never });
    mockFetchProducts.mockRejectedValue(new Error('offline'));
    await renderWithQuery(<Harness />);
    expect(await screen.findByText('Your inventory products could not be loaded.')).toBeTruthy();
  });

  it.each([
    ['a farmer', { role: 'farmer', account_status: 'approved' }],
    ['a buyer', { role: 'buyer', account_status: 'approved' }],
    ['a pending dealer', { role: 'dealer', account_status: 'pending' }],
    ['a rejected dealer', { role: 'dealer', account_status: 'rejected' }],
  ])('shows %s no picker and never asks the inventory API', async (_who, profile) => {
    useAuthStore.setState({ profile: profile as never });
    await renderWithQuery(<Harness />);
    await screen.findByText('Wheat');
    expect(screen.queryByText('Linked inventory product')).toBeNull();
    expect(mockFetchProducts).not.toHaveBeenCalled();
  });
});

describe('listingSchema', () => {
  const valid = { ...listingFormDefaults, title: 'Wheat seed', unit: 'bag', price: '4200', quantity: '120' };

  it('reads price and quantity as whole numbers', () => {
    const parsed = listingSchema.parse({ ...valid, price: '1,500' });
    expect(parsed.price).toBe(1500);
    expect(parsed.quantity).toBe(120);
  });

  it.each(['', '0', 'abc'])('refuses a price of "%s" with a message that says what counts', text => {
    const result = listingSchema.safeParse({ ...valid, price: text });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Enter the price in rupees, above Rs 0');
  });

  it('refuses a missing unit and a quantity of zero', () => {
    const result = listingSchema.safeParse({ ...valid, unit: '', quantity: '0' });
    expect(result.error?.issues.map(issue => issue.message)).toEqual(
      expect.arrayContaining(['Choose how it is sold, such as kg or bag', 'Enter how many you have, 1 or more']),
    );
  });
});
