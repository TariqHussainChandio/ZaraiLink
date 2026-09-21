import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { useForm } from 'react-hook-form';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../../localization';
import {
  ListingFormFields,
  listingFormDefaults,
  listingSchema,
  type ListingFormInput,
  type ListingFormValues,
} from './ListingFormFields';

jest.mock('../../../services/modules/marketplace/listingsService', () => ({
  fetchCategories: jest.fn().mockResolvedValue([
    { id: 'c1', name: 'Seeds', slug: 'seeds', icon: null, created_at: '' },
  ]),
  fetchCrops: jest.fn().mockResolvedValue([{ id: 'crop1', name: 'Wheat', category: null }]),
}));

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
  return <ListingFormFields control={control} errors={errors} setValue={setValue} watch={watch} />;
}

describe('ListingFormFields', () => {
  it('renders the core fields', async () => {
    await render(<Harness />);
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('Description')).toBeTruthy();
    expect(screen.getByText('Price')).toBeTruthy();
    expect(screen.getByText('Unit')).toBeTruthy();
    expect(screen.getByText('Quantity available')).toBeTruthy();
  });

  it('lets the user select a category', async () => {
    await render(<Harness />);
    await fireEvent.press(await screen.findByText('Seeds'));
    expect(screen.getByText('Seeds').parent?.props.accessibilityState.selected).toBe(true);
  });

  it('shows crop compatibility chips once crops load, and toggles selection', async () => {
    await render(<Harness />);
    await fireEvent.press(await screen.findByText('Wheat'));
    expect(screen.getByText('Wheat').parent?.props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByText('Wheat'));
    expect(screen.getByText('Wheat').parent?.props.accessibilityState.selected).toBe(false);
  });
});
