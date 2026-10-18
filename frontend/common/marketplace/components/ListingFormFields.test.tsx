import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { Text } from 'react-native';
import { useForm } from 'react-hook-form';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import {
  ListingFormFields,
  listingFormDefaults,
  listingSchema,
  type ListingFormInput,
  type ListingFormValues,
} from './ListingFormFields';
import { fetchLinkableInventoryProducts } from '../services/inventoryProductsService';
import { useAuthStore } from '../../../state/authStore';

jest.mock('../services/listingsService', () => ({
  fetchCategories: jest
    .fn()
    .mockResolvedValue([
      { id: 'c1', name: 'Seeds', slug: 'seeds', icon: null, created_at: '' },
    ]),
  fetchCrops: jest
    .fn()
    .mockResolvedValue([{ id: 'crop1', name: 'Wheat', category: null }]),
}));
jest.mock('../services/inventoryProductsService', () => ({
  fetchLinkableInventoryProducts: jest.fn(),
}));

const mockFetchProducts = fetchLinkableInventoryProducts as jest.Mock;

/** The form, plus the linked product's current value as text, so a test can see what a pick wrote. */
function Harness() {
  const {
    control,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ListingFormInput, any, ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: listingFormDefaults,
  });
  const linked = watch('inventoryProductId');
  return (
    <>
      <ListingFormFields
        control={control}
        errors={errors}
        setValue={setValue}
        watch={watch}
      />
      <Text testID="linked-value">{linked ?? 'null'}</Text>
    </>
  );
}

beforeEach(() => {
  mockFetchProducts.mockReset();
  mockFetchProducts.mockResolvedValue([
    {
      id: 'product-1',
      sku: 'UREA-1',
      name: 'Urea',
      unit: 'bag',
      is_active: true,
    },
    {
      id: 'product-old',
      sku: 'OLD-1',
      name: 'Old stock',
      unit: 'bag',
      is_active: false,
    },
  ]);
  useAuthStore.setState({
    profile: { role: 'farmer', account_status: 'approved' } as never,
  });
});

describe('ListingFormFields', () => {
  it('renders the core fields', async () => {
    await renderWithQuery(<Harness />);
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('Description')).toBeTruthy();
    expect(screen.getByText('Price')).toBeTruthy();
    expect(screen.getByText('Unit')).toBeTruthy();
    expect(screen.getByText('Quantity available')).toBeTruthy();
  });

  it('lets the user select a category', async () => {
    await renderWithQuery(<Harness />);
    await fireEvent.press(await screen.findByText('Seeds'));
    expect(
      screen.getByText('Seeds').parent?.props.accessibilityState.selected,
    ).toBe(true);
  });

  it('shows crop compatibility chips once crops load, and toggles selection', async () => {
    await renderWithQuery(<Harness />);
    await fireEvent.press(await screen.findByText('Wheat'));
    expect(
      screen.getByText('Wheat').parent?.props.accessibilityState.selected,
    ).toBe(true);
    await fireEvent.press(screen.getByText('Wheat'));
    expect(
      screen.getByText('Wheat').parent?.props.accessibilityState.selected,
    ).toBe(false);
  });

  // D8: the linked inventory product picker.
  it('offers an approved dealer their active products, and writes the pick or null for None', async () => {
    useAuthStore.setState({
      profile: { role: 'dealer', account_status: 'approved' } as never,
    });
    await renderWithQuery(<Harness />);

    const field = await screen.findByRole('button', {
      name: 'Linked inventory product (optional), None',
    });
    expect(
      screen.getByText(
        'Stock for this listing then comes from your inventory.',
      ),
    ).toBeTruthy();
    await fireEvent.press(field);
    expect(
      screen.queryByText('Old stock · OLD-1', { includeHiddenElements: true }),
    ).toBeNull();
    await fireEvent.press(
      await screen.findByRole('button', {
        name: 'Urea · UREA-1',
        includeHiddenElements: true,
      }),
    );
    expect(screen.getByTestId('linked-value').props.children).toBe('product-1');

    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Linked inventory product (optional), Urea · UREA-1',
      }),
    );
    await fireEvent.press(
      await screen.findByRole('button', {
        name: 'None',
        includeHiddenElements: true,
      }),
    );
    expect(screen.getByTestId('linked-value').props.children).toBe('null');
  });

  it('tells the dealer when their products could not be loaded', async () => {
    useAuthStore.setState({
      profile: { role: 'dealer', account_status: 'approved' } as never,
    });
    mockFetchProducts.mockRejectedValue(new Error('offline'));
    await renderWithQuery(<Harness />);
    expect(
      await screen.findByText('Your inventory products could not be loaded.'),
    ).toBeTruthy();
  });

  it.each([
    ['a farmer', { role: 'farmer', account_status: 'approved' }],
    ['a buyer', { role: 'buyer', account_status: 'approved' }],
    ['a pending dealer', { role: 'dealer', account_status: 'pending' }],
    ['a rejected dealer', { role: 'dealer', account_status: 'rejected' }],
  ])(
    'shows %s no picker and never asks the inventory API',
    async (_who, profile) => {
      useAuthStore.setState({ profile: profile as never });
      await renderWithQuery(<Harness />);
      await screen.findByText('Seeds');
      expect(
        screen.queryByText('Linked inventory product (optional)'),
      ).toBeNull();
      expect(mockFetchProducts).not.toHaveBeenCalled();
    },
  );
});
