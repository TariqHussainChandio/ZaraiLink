import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { ApplicationWizardScreen } from './ApplicationWizardScreen';
import {
  attachDocument,
  fetchApplicationDocuments,
  fetchDealerApplication,
  fetchRequiredDocuments,
  removeDocument,
  saveDealerApplication,
  submitApplication,
} from '../services/applicationService';
import { createExpertApplication, fetchExpertProfile } from '../../../expert/services/expertService';
import { pickApplicationDocument } from '../../../utils/documentPicker';
import { useAuthStore } from '../../../state/authStore';
import type { Profile } from '../../types/profile';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
}));
jest.mock('../services/applicationService', () => ({
  attachDocument: jest.fn(),
  fetchApplicationDocuments: jest.fn(),
  fetchDealerApplication: jest.fn(),
  fetchRequiredDocuments: jest.fn(),
  removeDocument: jest.fn(),
  saveDealerApplication: jest.fn(),
  submitApplication: jest.fn(),
}));
jest.mock('../../../expert/services/expertService', () => ({
  fetchExpertProfile: jest.fn(),
  createExpertApplication: jest.fn(),
  updateExpertProfile: jest.fn(),
}));
jest.mock('../../../utils/documentPicker', () => ({
  ...jest.requireActual('../../../utils/documentPicker'),
  pickApplicationDocument: jest.fn(),
}));

const required = [
  { id: 'req-reg', role: 'dealer', code: 'business_registration', label: 'Business registration certificate', description: null, is_required: true, active: true, sort_order: 10 },
  { id: 'req-lic', role: 'dealer', code: 'business_licence', label: 'Business licence', description: 'Your trade licence.', is_required: true, active: true, sort_order: 20 },
  { id: 'req-other', role: 'dealer', code: 'other', label: 'Other supporting documents', description: null, is_required: false, active: true, sort_order: 90 },
];
const doc = (id: string, requirement: string) => ({
  id,
  required_document_id: requirement,
  file_name: `${id}.pdf`,
  mime_type: 'application/pdf',
  size_bytes: 2048,
  created_at: '2026-10-12T08:00:00Z',
  required_document: null,
});
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

const refreshProfile = jest.fn(() => Promise.resolve());

function signedInAs(overrides: Partial<Profile>) {
  useAuthStore.setState({
    user: { id: 'user-1' } as never,
    profile: { id: 'user-1', role: 'dealer', account_status: 'pending', application_submitted_at: null, ...overrides } as Profile,
    refreshProfile,
  });
}

function first<T>(items: T[]): T {
  const [item] = items;
  if (!item) throw new Error('nothing found');
  return item;
}

beforeEach(() => {
  jest.clearAllMocks();
  (fetchRequiredDocuments as jest.Mock).mockResolvedValue(required);
  (fetchApplicationDocuments as jest.Mock).mockResolvedValue([]);
  (fetchDealerApplication as jest.Mock).mockResolvedValue(null);
});

describe('ApplicationWizardScreen (A3b; SRDS §7–§11)', () => {
  it('takes a dealer from business details through documents to submission', async () => {
    signedInAs({ role: 'dealer' });
    // Once saved, the API returns the saved details, as the server does.
    (saveDealerApplication as jest.Mock).mockImplementation(input => {
      (fetchDealerApplication as jest.Mock).mockResolvedValue({ ...business, ...input });
      return Promise.resolve({ ...business, ...input });
    });
    await renderWithQuery(<ApplicationWizardScreen />);

    expect(screen.getByLabelText('Step 1 of 4, Account, done')).toBeTruthy();
    expect(screen.getByLabelText('Step 2 of 4, Business, current step')).toBeTruthy();
    await fireEvent.changeText(await screen.findByLabelText('Business name'), 'Green Inputs');
    await fireEvent.press(screen.getByText('Wholesaler'));
    await fireEvent.changeText(screen.getByLabelText('Registration or licence number'), 'NTN-1');
    await fireEvent.changeText(screen.getByLabelText('Business address'), '7 Grain Market Road');
    await fireEvent.changeText(screen.getByLabelText('Country'), 'Pakistan');
    await fireEvent.changeText(screen.getByLabelText('Province'), 'Sindh');
    await fireEvent.changeText(screen.getByLabelText('City'), 'Hyderabad');
    await fireEvent.press(screen.getByText('Save and continue'));

    expect(saveDealerApplication).toHaveBeenCalledWith({
      business_name: 'Green Inputs',
      business_type: 'wholesaler',
      registration_number: 'NTN-1',
      business_address: '7 Grain Market Road',
      country: 'Pakistan',
      province: 'Sindh',
      city: 'Hyderabad',
    });

    // Documents: each required one, and an optional one.
    expect(await screen.findByText('Business registration certificate')).toBeTruthy();
    expect(screen.getByText('Your trade licence.')).toBeTruthy();
    expect(screen.getAllByText('Needed')).toHaveLength(2);
    expect(screen.getByText('Optional')).toBeTruthy();
    const file = { uri: 'file:///cache/reg.pdf', mimeType: 'application/pdf', fileName: 'reg.pdf', sizeBytes: 4096 };
    (pickApplicationDocument as jest.Mock).mockResolvedValue(file);
    (attachDocument as jest.Mock).mockResolvedValue(doc('reg', 'req-reg'));
    (fetchApplicationDocuments as jest.Mock).mockResolvedValue([doc('reg', 'req-reg')]);
    await fireEvent.press(first(screen.getAllByText('Add file')));
    expect(attachDocument).toHaveBeenCalledWith('dealer', 'user-1', file, 'req-reg');
    expect(await screen.findByText('reg.pdf')).toBeTruthy();

    // Review: the licence is still missing, so submitting waits.
    await fireEvent.press(screen.getByText('Continue to review'));
    expect(await screen.findByText('Add what is missing above before you submit.')).toBeTruthy();
    expect(screen.getByLabelText('Business licence, missing')).toBeTruthy();
    expect(screen.getByText('Green Inputs')).toBeTruthy();
    await fireEvent.press(screen.getByText('Submit for review'));
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it('submits a complete dealer application and returns to the status screen', async () => {
    signedInAs({ role: 'dealer', account_status: 'rejected' });
    (fetchDealerApplication as jest.Mock).mockResolvedValue(business);
    (fetchApplicationDocuments as jest.Mock).mockResolvedValue([doc('reg', 'req-reg'), doc('lic', 'req-lic')]);
    (saveDealerApplication as jest.Mock).mockResolvedValue(business);
    (submitApplication as jest.Mock).mockResolvedValue(undefined);
    await renderWithQuery(<ApplicationWizardScreen />);

    // A rejected dealer's saved details come back to correct.
    await waitFor(() => expect(screen.getByLabelText('Business name').props.value).toBe('Green Inputs'));
    await fireEvent.press(screen.getByText('Save and continue'));
    await fireEvent.press(await screen.findByText('Continue to review'));
    await fireEvent.press(await screen.findByText('Submit for review'));

    await waitFor(() => expect(submitApplication).toHaveBeenCalledTimes(1));
    expect(refreshProfile).toHaveBeenCalled();
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('removes a document while the application can still change', async () => {
    signedInAs({ role: 'dealer' });
    (fetchDealerApplication as jest.Mock).mockResolvedValue(business);
    (saveDealerApplication as jest.Mock).mockResolvedValue(business);
    (fetchApplicationDocuments as jest.Mock).mockResolvedValue([doc('reg', 'req-reg')]);
    (removeDocument as jest.Mock).mockResolvedValue(undefined);
    await renderWithQuery(<ApplicationWizardScreen />);
    await waitFor(() => expect(screen.getByLabelText('Business name').props.value).toBe('Green Inputs'));
    await fireEvent.press(screen.getByText('Save and continue'));

    await fireEvent.press(await screen.findByLabelText('Remove reg.pdf'));
    expect(removeDocument).toHaveBeenCalledWith('dealer', 'reg');
  });

  it('refuses a file over 10 MB before uploading it', async () => {
    signedInAs({ role: 'dealer' });
    (fetchDealerApplication as jest.Mock).mockResolvedValue(business);
    (saveDealerApplication as jest.Mock).mockResolvedValue(business);
    (pickApplicationDocument as jest.Mock).mockResolvedValue({
      uri: 'file:///cache/big.pdf',
      mimeType: 'application/pdf',
      fileName: 'big.pdf',
      sizeBytes: 11 * 1024 * 1024,
    });
    await renderWithQuery(<ApplicationWizardScreen />);
    await waitFor(() => expect(screen.getByLabelText('Business name').props.value).toBe('Green Inputs'));
    await fireEvent.press(screen.getByText('Save and continue'));
    await fireEvent.press(first(await screen.findAllByText('Add file')));

    expect(await screen.findByText(/larger than 10 MB/)).toBeTruthy();
    expect(attachDocument).not.toHaveBeenCalled();
  });

  it('opens an application under review on the review, read only', async () => {
    signedInAs({ role: 'dealer', application_submitted_at: '2026-10-12T08:00:00Z' });
    (fetchDealerApplication as jest.Mock).mockResolvedValue(business);
    (fetchApplicationDocuments as jest.Mock).mockResolvedValue([doc('reg', 'req-reg'), doc('lic', 'req-lic')]);
    await renderWithQuery(<ApplicationWizardScreen />);

    expect(screen.getByLabelText('Step 4 of 4, Review, current step')).toBeTruthy();
    expect(await screen.findByText(/cannot be changed until they decide/)).toBeTruthy();
    expect(screen.queryByText('Submit for review')).toBeNull();
    expect(await screen.findByText('reg.pdf')).toBeTruthy();
    expect(screen.queryByLabelText('Remove reg.pdf')).toBeNull();
    expect(screen.queryByText('Add file')).toBeNull();
  });

  it('asks an expert for the professional details SRDS §10 lists, then saves them as the draft', async () => {
    signedInAs({ role: 'expert' });
    (fetchExpertProfile as jest.Mock).mockResolvedValue(null);
    (createExpertApplication as jest.Mock).mockResolvedValue({ id: 'user-1' });
    await renderWithQuery(<ApplicationWizardScreen />);

    expect(screen.getByLabelText('Step 2 of 4, Professional, current step')).toBeTruthy();
    await fireEvent.press(await screen.findByText('Save and continue'));
    expect(await screen.findByText('Enter your years of experience as a number')).toBeTruthy();
    expect(screen.getByText('Enter the institution you are affiliated with')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Qualifications'), 'MSc Plant Pathology');
    await fireEvent.changeText(screen.getByLabelText('Highest degree or certification'), 'MSc');
    await fireEvent.changeText(screen.getByLabelText('Years of experience'), '8');
    await fireEvent.changeText(screen.getByLabelText('Institution affiliation'), 'Sindh Agriculture University');
    await fireEvent.press(screen.getByText('Save and continue'));
    expect(await screen.findByText('Choose at least one specialization')).toBeTruthy();
    await fireEvent.press(screen.getByText('Plant Diseases'));
    await fireEvent.press(screen.getByText('Save and continue'));

    await waitFor(() =>
      expect(createExpertApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          qualifications: 'MSc Plant Pathology',
          yearsExperience: 8,
          institutionAffiliation: 'Sindh Agriculture University',
          specializations: ['plant_diseases'],
        }),
      ),
    );
  });
});
