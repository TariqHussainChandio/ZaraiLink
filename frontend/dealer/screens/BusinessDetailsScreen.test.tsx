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
    (saveDealerApplication as jest.Mock).mockImplementation((input) => Promise.resolve({ ...business, ...input }));
  });

  it('fills the saved details, saves an edit and goes back to the profile', async () => {
    await renderWithQuery(<BusinessDetailsScreen />);
    expect(await screen.findByDisplayValue('Green Inputs')).toBeTruthy();
    // The profile's form saves and returns; the wizard's "Save and continue" belongs to the application.
    expect(screen.queryByText('Save and continue')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Business address'), '9 Grain Market Road');
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
    expect(saveDealerApplication).toHaveBeenCalledWith(expect.objectContaining({ business_address: '9 Grain Market Road' }));
  });

  it('stays open when the save is refused', async () => {
    (saveDealerApplication as jest.Mock).mockRejectedValue(new Error('application_locked'));
    await renderWithQuery(<BusinessDetailsScreen />);
    await screen.findByDisplayValue('Green Inputs');
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() => expect(saveDealerApplication).toHaveBeenCalled());
    expect(mockGoBack).not.toHaveBeenCalled();
  });
});
