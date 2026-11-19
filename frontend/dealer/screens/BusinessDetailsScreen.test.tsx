import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { BusinessDetailsScreen } from './BusinessDetailsScreen';
import { fetchDealerApplication, saveDealerApplication } from '../../common/auth/services/applicationService';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
}));
jest.mock('../../common/auth/services/applicationService', () => ({
  fetchDealerApplication: jest.fn(),
  saveDealerApplication: jest.fn(),
}));

const business = {
  id: 'user-1',
  business_name: 'Green Inputs',
  business_type: 'wholesaler',
  registration_number: 'NTN-1',
  business_address: '7 Grain Market Road',
  country: 'Pakistan',
  province: 'Sindh',
  city: 'Hyderabad',
  created_at: '',
  updated_at: '',
};

describe('BusinessDetailsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchDealerApplication as jest.Mock).mockResolvedValue(business);
    (saveDealerApplication as jest.Mock).mockImplementation(input => Promise.resolve({ ...business, ...input }));
  });

  it('fills the saved details, saves an edit and goes back to the profile', async () => {
    await renderWithQuery(<BusinessDetailsScreen />);
    expect(await screen.findByDisplayValue('Green Inputs')).toBeTruthy();
    // The profile's form saves and returns; the wizard's "Save and continue" belongs to the application.
    expect(screen.queryByText('Save and continue')).toBeNull();
    // It is the approved dealer's own profile: no application steps, no Back.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Business address'), '9 Grain Market Road');
    await fireEvent.press(screen.getByText('Save details'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
    expect(saveDealerApplication).toHaveBeenCalledWith(expect.objectContaining({ business_address: '9 Grain Market Road', country: 'Pakistan' }));
    expect(await screen.findByText('Business details saved')).toBeTruthy();
  });

  it('stays open and shows the refusal when the save is refused', async () => {
    (saveDealerApplication as jest.Mock).mockRejectedValue(new Error('Server unavailable'));
    await renderWithQuery(<BusinessDetailsScreen />);
    await screen.findByDisplayValue('Green Inputs');
    await fireEvent.press(screen.getByText('Save details'));

    await waitFor(() => expect(saveDealerApplication).toHaveBeenCalled());
    expect(await screen.findByText('Server unavailable')).toBeTruthy();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('shows a failed load as a failure with Try again, and does not offer to save an empty form', async () => {
    (fetchDealerApplication as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));
    await renderWithQuery(<BusinessDetailsScreen />);

    expect(await screen.findByText("Couldn't load your saved details")).toBeTruthy();
    expect(screen.queryByText('Save details')).toBeNull();
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByDisplayValue('Green Inputs')).toBeTruthy();
  });
});
