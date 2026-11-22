import React from 'react';
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

// Since A3b this is the expert's profile editor; the application itself (with documents) is ApplicationWizardScreen. Since
// the Rate Board redesign (AU-18) it is the application's own professional-details form, so the two cannot drift apart.
describe('ExpertApplicationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: { id: 'expert1' } as never });
  });

  it('pre-fills the form with the saved profile, the years and the institution included', async () => {
    mockFetchExpertProfile.mockResolvedValue(existingProfile);
    await renderWithQuery(<ExpertApplicationScreen />);

    expect(await screen.findByLabelText('Qualifications')).toBeTruthy();
    await screen.findByDisplayValue('PhD Agronomy');
    expect(screen.getByLabelText('Years of experience').props.value).toBe('10');
    expect(screen.getByLabelText('Institution affiliation').props.value).toBe('University of Agriculture Faisalabad');
    // The same labels as the application, and the optional ones are marked.
    expect(screen.getByLabelText('Highest degree or certification')).toBeTruthy();
    expect(screen.queryByLabelText('Degree / Certification')).toBeNull();
    expect(screen.getAllByText('Optional').length).toBeGreaterThan(0);
    expect(screen.getByText('Save profile')).toBeTruthy();
  });

  it('shows a retryable error when loading fails, never an empty form that would start a second application', async () => {
    mockFetchExpertProfile.mockRejectedValue(new TypeError('Network request failed'));
    await renderWithQuery(<ExpertApplicationScreen />);

    expect(await screen.findByText("Couldn't load your saved details")).toBeTruthy();
    expect(screen.getByText('No connection. Check your internet, then try again.')).toBeTruthy();
    expect(screen.queryByLabelText('Qualifications')).toBeNull();

    mockFetchExpertProfile.mockResolvedValue(null);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByLabelText('Qualifications')).toBeTruthy();
  });

  it('shows a validation error when qualifications is left empty', async () => {
    mockFetchExpertProfile.mockResolvedValue(null);
    await renderWithQuery(<ExpertApplicationScreen />);
    await screen.findByLabelText('Qualifications');

    await fireEvent.press(screen.getByText('Save profile'));
    expect((await screen.findAllByText('Enter your qualifications')).length).toBeGreaterThan(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('requires at least one specialization, and says so under the chips', async () => {
    mockFetchExpertProfile.mockResolvedValue(null);
    await renderWithQuery(<ExpertApplicationScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Qualifications'), 'PhD Agronomy, extension work');
    await fireEvent.changeText(screen.getByLabelText('Highest degree or certification'), 'PhD');
    await fireEvent.changeText(screen.getByLabelText('Years of experience'), '10');
    await fireEvent.changeText(screen.getByLabelText('Institution affiliation'), 'University of Agriculture');

    await fireEvent.press(screen.getByText('Save profile'));
    expect((await screen.findAllByText('Choose at least one specialization')).length).toBeGreaterThan(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('starts the profile when there is none yet', async () => {
    mockFetchExpertProfile.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'expert1' });
    await renderWithQuery(<ExpertApplicationScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Qualifications'), 'PhD Agronomy, extension work');
    await fireEvent.changeText(screen.getByLabelText('Highest degree or certification'), 'PhD');
    await fireEvent.changeText(screen.getByLabelText('Years of experience'), '10');
    await fireEvent.changeText(screen.getByLabelText('Institution affiliation'), 'University of Agriculture');
    await fireEvent.press(screen.getByText('Crop management'));

    await fireEvent.press(screen.getByText('Save profile'));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        qualifications: 'PhD Agronomy, extension work',
        specializations: ['crop_management'],
      }),
    );
  });

  it('updates an existing profile, keeping the years and the institution, and confirms with a snackbar', async () => {
    mockFetchExpertProfile.mockResolvedValue(existingProfile);
    mockUpdateExpertProfile.mockResolvedValue(existingProfile);
    await renderWithQuery(<ExpertApplicationScreen />);

    await fireEvent.press(await screen.findByText('Save profile'));

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
    expect(await screen.findByText('Professional profile saved')).toBeTruthy();
  });

  it('shows a failed save as a banner, not an alert', async () => {
    mockFetchExpertProfile.mockResolvedValue(existingProfile);
    mockUpdateExpertProfile.mockRejectedValue(new Error('Server unavailable'));
    await renderWithQuery(<ExpertApplicationScreen />);

    await fireEvent.press(await screen.findByText('Save profile'));
    expect(await screen.findByText('Server unavailable')).toBeTruthy();
    expect(screen.queryByText('Professional profile saved')).toBeNull();
  });
});
