import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ExpertApplicationScreen } from './ExpertApplicationScreen';
import {
  fetchExpertProfile,
  submitExpertApplication,
  updateExpertProfile,
  uploadExpertDocument,
} from '../../services/modules/expert/expertService';
import { pickPhotos } from '../../utils/photoPicker';
import { useAuthStore } from '../../store/authStore';
import type { ExpertWithProfile } from '../../types/expert';

jest.mock('../../services/modules/expert/expertService', () => ({
  fetchExpertProfile: jest.fn(),
  submitExpertApplication: jest.fn(),
  updateExpertProfile: jest.fn(),
  uploadExpertDocument: jest.fn(),
}));
jest.mock('../../utils/photoPicker', () => ({
  pickPhotos: jest.fn(),
}));

const mockFetchExpertProfile = fetchExpertProfile as jest.Mock;
const mockSubmitExpertApplication = submitExpertApplication as jest.Mock;
const mockUpdateExpertProfile = updateExpertProfile as jest.Mock;
const mockUploadExpertDocument = uploadExpertDocument as jest.Mock;
const mockPickPhotos = pickPhotos as jest.Mock;

const existingProfile: ExpertWithProfile = {
  id: 'expert1',
  qualifications: 'PhD Agronomy',
  degree: 'PhD',
  experience: '10 years',
  professional_description: 'Crop specialist',
  location: { country: 'Pakistan', province: 'Punjab', city: 'Lahore' },
  contact: '0300-0000000',
  verification_status: 'approved',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  profile: { id: 'expert1', full_name: 'Dr. Ahsan', avatar_url: null },
  expert_specializations: [{ specialization: 'plant_diseases' }],
};

describe('ExpertApplicationScreen', () => {
  beforeEach(() => {
    mockFetchExpertProfile.mockReset();
    mockSubmitExpertApplication.mockReset();
    mockUpdateExpertProfile.mockReset();
    mockUploadExpertDocument.mockReset();
    mockPickPhotos.mockReset();
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a blank form for a first-time applicant', async () => {
    mockFetchExpertProfile.mockResolvedValue(null);
    await render(<ExpertApplicationScreen />);

    expect(await screen.findByLabelText('Qualifications')).toBeTruthy();
    expect(screen.getByLabelText('Qualifications').props.value).toBe('');
    expect(screen.getByText('Submit Application')).toBeTruthy();
    expect(screen.getByText('+ Add a photo of your certificate')).toBeTruthy();
  });

  it('pre-fills the form and switches to edit mode when a profile already exists', async () => {
    mockFetchExpertProfile.mockResolvedValue(existingProfile);
    await render(<ExpertApplicationScreen />);

    expect(await screen.findByLabelText('Qualifications')).toBeTruthy();
    expect(screen.getByLabelText('Qualifications').props.value).toBe('PhD Agronomy');
    expect(screen.getByLabelText('Contact').props.value).toBe('0300-0000000');
    expect(screen.getByText('Save Changes')).toBeTruthy();
    expect(screen.queryByText('+ Add a photo of your certificate')).toBeNull();
  });

  it('shows a retryable error state when loading fails', async () => {
    mockFetchExpertProfile.mockRejectedValue(new Error('network down'));
    await render(<ExpertApplicationScreen />);

    expect(await screen.findByText("Couldn't load your application")).toBeTruthy();

    mockFetchExpertProfile.mockResolvedValue(null);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByLabelText('Qualifications')).toBeTruthy();
  });

  it('shows a validation error when qualifications is left empty', async () => {
    mockFetchExpertProfile.mockResolvedValue(null);
    await render(<ExpertApplicationScreen />);
    await screen.findByLabelText('Qualifications');

    await fireEvent.press(screen.getByText('Submit Application'));
    expect(await screen.findByText('Enter your qualifications')).toBeTruthy();
    expect(mockSubmitExpertApplication).not.toHaveBeenCalled();
  });

  it('requires at least one specialization before submitting', async () => {
    mockFetchExpertProfile.mockResolvedValue(null);
    await render(<ExpertApplicationScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Qualifications'), 'PhD Agronomy, extension work');

    await fireEvent.press(screen.getByText('Submit Application'));
    expect(Alert.alert).toHaveBeenCalledWith('Select at least one specialization');
    expect(mockSubmitExpertApplication).not.toHaveBeenCalled();
  });

  it('submits a new application with a picked document', async () => {
    mockFetchExpertProfile.mockResolvedValue(null);
    mockPickPhotos.mockResolvedValue([{ uri: 'file://cert.jpg', fileName: 'cert.jpg', type: 'image/jpeg' }]);
    mockUploadExpertDocument.mockResolvedValue('expert1/cert.jpg');
    mockSubmitExpertApplication.mockResolvedValue({ id: 'expert1' });

    await render(<ExpertApplicationScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Qualifications'), 'PhD Agronomy, extension work');
    await fireEvent.press(screen.getByText('Crop Management'));
    await fireEvent.press(screen.getByText('+ Add a photo of your certificate'));
    await screen.findByText('Submit Application');

    await fireEvent.press(screen.getByText('Submit Application'));

    expect(mockUploadExpertDocument).toHaveBeenCalledWith('expert1', {
      uri: 'file://cert.jpg',
      fileName: 'cert.jpg',
      type: 'image/jpeg',
    });
    expect(mockSubmitExpertApplication).toHaveBeenCalledWith(
      {
        qualifications: 'PhD Agronomy, extension work',
        degree: '',
        experience: '',
        professionalDescription: '',
        contact: '',
        country: null,
        province: null,
        city: null,
        specializations: ['crop_management'],
      },
      'expert1/cert.jpg',
    );
    expect(Alert.alert).toHaveBeenCalledWith('Application submitted', 'An admin will review your application.');
  });

  it('updates an existing profile without touching document upload', async () => {
    mockFetchExpertProfile.mockResolvedValue(existingProfile);
    mockUpdateExpertProfile.mockResolvedValue(existingProfile);
    await render(<ExpertApplicationScreen />);

    await fireEvent.press(await screen.findByText('Save Changes'));

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
    });
    expect(mockUploadExpertDocument).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Profile updated', 'An admin will review your application.');
  });

  it('shows an error alert when saving fails', async () => {
    mockFetchExpertProfile.mockResolvedValue(existingProfile);
    mockUpdateExpertProfile.mockRejectedValue(new Error('Server unavailable'));
    await render(<ExpertApplicationScreen />);

    await fireEvent.press(await screen.findByText('Save Changes'));
    expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'Server unavailable');
  });
});
