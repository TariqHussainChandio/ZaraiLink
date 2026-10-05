import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { ExpertApplicationScreen } from './ExpertApplicationScreen';
import { createExpertApplication, fetchExpertProfile, updateExpertProfile } from '../services/expertService';
import { useAuthStore } from '../../state/authStore';
import type { ExpertWithProfile } from '../types/expert';

jest.mock('../services/expertService', () => ({
  fetchExpertProfile: jest.fn(),
  createExpertApplication: jest.fn(),
  updateExpertProfile: jest.fn(),
}));

const mockFetchExpertProfile = fetchExpertProfile as jest.Mock;
const mockCreate = createExpertApplication as jest.Mock;
const mockUpdateExpertProfile = updateExpertProfile as jest.Mock;

const existingProfile: ExpertWithProfile = {
  id: 'expert1',
  qualifications: 'PhD Agronomy',
  degree: 'PhD',
  experience: '10 years',
  professional_description: 'Crop specialist',
  location: { country: 'Pakistan', province: 'Punjab', city: 'Lahore' },
  contact: '0300-0000000',
  years_experience: 10,
  institution_affiliation: 'University of Agriculture Faisalabad',
  verification_status: 'approved',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  profile: { id: 'expert1', full_name: 'Dr. Ahsan', avatar_url: null },
  expert_specializations: [{ specialization: 'plant_diseases' }],
};

// Since A3b this is the expert's profile editor; the application itself (with documents) is ApplicationWizardScreen.
describe('ExpertApplicationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('pre-fills the form with the saved profile, the years and the institution included', async () => {
    mockFetchExpertProfile.mockResolvedValue(existingProfile);
    await renderWithQuery(<ExpertApplicationScreen />);

    expect(await screen.findByLabelText('Qualifications')).toBeTruthy();
    expect(screen.getByLabelText('Qualifications').props.value).toBe('PhD Agronomy');
    expect(screen.getByLabelText('Years of experience').props.value).toBe('10');
    expect(screen.getByLabelText('Institution affiliation').props.value).toBe('University of Agriculture Faisalabad');
    expect(screen.getByText('Save changes')).toBeTruthy();
    expect(screen.queryByText(/Add a photo/)).toBeNull();
  });

  it('shows a retryable error state when loading fails', async () => {
    mockFetchExpertProfile.mockRejectedValue(new Error('network down'));
    await renderWithQuery(<ExpertApplicationScreen />);

    expect(await screen.findByText("Couldn't load your application")).toBeTruthy();

    mockFetchExpertProfile.mockResolvedValue(null);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByLabelText('Qualifications')).toBeTruthy();
  });

  it('shows a validation error when qualifications is left empty', async () => {
    mockFetchExpertProfile.mockResolvedValue(null);
    await renderWithQuery(<ExpertApplicationScreen />);
    await screen.findByLabelText('Qualifications');

    await fireEvent.press(screen.getByText('Save changes'));
    expect(await screen.findByText('Enter your qualifications')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('requires at least one specialization', async () => {
    mockFetchExpertProfile.mockResolvedValue(null);
    await renderWithQuery(<ExpertApplicationScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Qualifications'), 'PhD Agronomy, extension work');

    await fireEvent.press(screen.getByText('Save changes'));
    expect(Alert.alert).toHaveBeenCalledWith('Select at least one specialization');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('starts the profile when there is none yet', async () => {
    mockFetchExpertProfile.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'expert1' });
    await renderWithQuery(<ExpertApplicationScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Qualifications'), 'PhD Agronomy, extension work');
    await fireEvent.press(screen.getByText('Crop Management'));

    await fireEvent.press(screen.getByText('Save changes'));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ qualifications: 'PhD Agronomy, extension work', specializations: ['crop_management'] }),
    );
  });

  it('updates an existing profile, keeping the years and the institution', async () => {
    mockFetchExpertProfile.mockResolvedValue(existingProfile);
    mockUpdateExpertProfile.mockResolvedValue(existingProfile);
    await renderWithQuery(<ExpertApplicationScreen />);

    await fireEvent.press(await screen.findByText('Save changes'));

    expect(mockUpdateExpertProfile).toHaveBeenCalledWith({
      qualifications: 'PhD Agronomy',
      degree: 'PhD',
      experience: '10 years',
      professionalDescription: 'Crop specialist',
      contact: '0300-0000000',
      country: 'Pakistan',
      province: 'Punjab',
      city: 'Lahore',
      specializations: ['plant_diseases'],
      yearsExperience: 10,
      institutionAffiliation: 'University of Agriculture Faisalabad',
    });
    expect(Alert.alert).toHaveBeenCalledWith('Profile updated');
  });

  it('shows an error alert when saving fails', async () => {
    mockFetchExpertProfile.mockResolvedValue(existingProfile);
    mockUpdateExpertProfile.mockRejectedValue(new Error('Server unavailable'));
    await renderWithQuery(<ExpertApplicationScreen />);

    await fireEvent.press(await screen.findByText('Save changes'));
    expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'Server unavailable');
  });
});
