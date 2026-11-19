import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
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
// The handler the wizard registers for the system Back gesture and the app bar's arrow.
let mockBeforeRemove: ((event: { preventDefault: () => void }) => void) | undefined;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    goBack: mockGoBack,
    navigate: jest.fn(),
    addListener: (_name: string, handler: (event: { preventDefault: () => void }) => void) => {
      mockBeforeRemove = handler;
      return () => {
        mockBeforeRemove = undefined;
      };
    },
  }),
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
  mockBeforeRemove = undefined;
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
    // The country is not asked; the province is chosen from a list.
    expect(screen.queryByLabelText('Country')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Province/ }));
    await fireEvent.press(await screen.findByText('Sindh'));
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
    expect(screen.getByText('0 of 2 required documents added')).toBeTruthy();
    const file = { uri: 'file:///cache/reg.pdf', mimeType: 'application/pdf', fileName: 'reg.pdf', sizeBytes: 4096 };
    (pickApplicationDocument as jest.Mock).mockResolvedValue(file);
    (attachDocument as jest.Mock).mockResolvedValue(doc('reg', 'req-reg'));
    (fetchApplicationDocuments as jest.Mock).mockResolvedValue([doc('reg', 'req-reg')]);
    await fireEvent.press(first(screen.getAllByText('Add photo or PDF')));
    expect(attachDocument).toHaveBeenCalledWith('dealer', 'user-1', file, 'req-reg');
    expect(await screen.findByText('reg.pdf')).toBeTruthy();

    // Review: the licence is still missing, so submitting waits.
    await fireEvent.press(screen.getByText('Continue to review'));
    expect(await screen.findByText('Add what is missing above before you send the application.')).toBeTruthy();
    expect(screen.getByText('Business licence')).toBeTruthy();
    expect(screen.getByText('Needed')).toBeTruthy();
    expect(screen.getByText('Green Inputs')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Send for review' }));
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
    await fireEvent.press(await screen.findByText('Send for review'));

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
    // Removing asks first; nothing is deleted by the first tap.
    expect(removeDocument).not.toHaveBeenCalled();
    expect(await screen.findByText('Remove this file?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove file' }));
    await waitFor(() => expect(removeDocument).toHaveBeenCalledWith('dealer', 'reg'));
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
    await fireEvent.press(first(await screen.findAllByText('Add photo or PDF')));

    // The error sits inside the card of the document it was for.
    expect(await screen.findByText("Couldn't add the file")).toBeTruthy();
    expect(screen.getByText(/larger than 10 MB/)).toBeTruthy();
    expect(attachDocument).not.toHaveBeenCalled();
  });

  it('opens an application under review on the review, read only', async () => {
    signedInAs({ role: 'dealer', application_submitted_at: '2026-10-12T08:00:00Z' });
    (fetchDealerApplication as jest.Mock).mockResolvedValue(business);
    (fetchApplicationDocuments as jest.Mock).mockResolvedValue([doc('reg', 'req-reg'), doc('lic', 'req-lic')]);
    await renderWithQuery(<ApplicationWizardScreen />);

    expect(screen.getByLabelText('Step 4 of 4, Review, current step')).toBeTruthy();
    expect(await screen.findByText(/cannot be changed until they decide/)).toBeTruthy();
    expect(screen.queryByText('Send for review')).toBeNull();
    expect(await screen.findByText('reg.pdf')).toBeTruthy();
    expect(screen.queryByLabelText('Remove reg.pdf')).toBeNull();
    expect(screen.queryByText('Add photo or PDF')).toBeNull();
  });

  it('asks an expert for the professional details SRDS §10 lists, then saves them as the draft', async () => {
    signedInAs({ role: 'expert' });
    (fetchExpertProfile as jest.Mock).mockResolvedValue(null);
    (createExpertApplication as jest.Mock).mockResolvedValue({ id: 'user-1' });
    await renderWithQuery(<ApplicationWizardScreen />);

    expect(screen.getByLabelText('Step 2 of 4, Professional, current step')).toBeTruthy();
    await fireEvent.press(await screen.findByText('Save and continue'));
    expect((await screen.findAllByText('Enter your years of experience as a number')).length).toBeGreaterThan(0);
    expect(screen.getByText('Enter the institution you are affiliated with')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Qualifications'), 'MSc Plant Pathology');
    await fireEvent.changeText(screen.getByLabelText('Highest degree or certification'), 'MSc');
    await fireEvent.changeText(screen.getByLabelText('Years of experience'), '8');
    await fireEvent.changeText(screen.getByLabelText('Institution affiliation'), 'Sindh Agriculture University');
    await fireEvent.press(screen.getByText('Save and continue'));
    expect((await screen.findAllByText('Choose at least one specialization')).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByText('Plant diseases'));
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

  it('shows a rejected applicant the administrator reason on every step, not only on the status screen (AU-10)', async () => {
    signedInAs({ role: 'dealer', account_status: 'rejected', account_status_reason: 'The business licence is missing.' });
    (fetchDealerApplication as jest.Mock).mockResolvedValue(business);
    (saveDealerApplication as jest.Mock).mockResolvedValue(business);
    await renderWithQuery(<ApplicationWizardScreen />);
    await waitFor(() => expect(screen.getByLabelText('Business name').props.value).toBe('Green Inputs'));
    expect(screen.getByText('The business licence is missing.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Save and continue'));
    expect(await screen.findByText('Continue to review')).toBeTruthy();
    expect(screen.getByText('The business licence is missing.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Continue to review'));
    expect(await screen.findByRole('button', { name: 'Send for review' })).toBeTruthy();
    expect(screen.getByText('The business licence is missing.')).toBeTruthy();
  });

  it('goes back one step at a time, and from the review changes a section (AU-15)', async () => {
    signedInAs({ role: 'dealer' });
    (fetchDealerApplication as jest.Mock).mockResolvedValue(business);
    (saveDealerApplication as jest.Mock).mockResolvedValue(business);
    await renderWithQuery(<ApplicationWizardScreen />);
    await waitFor(() => expect(screen.getByLabelText('Business name').props.value).toBe('Green Inputs'));
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    await fireEvent.press(screen.getByText('Save and continue'));
    await fireEvent.press(await screen.findByText('Continue to review'));

    expect(await screen.findByRole('button', { name: 'Change business details' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Continue to review')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText('Business name')).toBeTruthy();

    await fireEvent.press(screen.getByText('Save and continue'));
    await fireEvent.press(await screen.findByText('Continue to review'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Change documents' }));
    expect(await screen.findByText('Continue to review')).toBeTruthy();
  });

  it('shows a failed load as a failure with Try again, never as an empty form (AU-12)', async () => {
    signedInAs({ role: 'dealer', account_status: 'rejected' });
    (fetchDealerApplication as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));
    await renderWithQuery(<ApplicationWizardScreen />);

    expect(await screen.findByText("Couldn't load your saved details")).toBeTruthy();
    expect(screen.queryByLabelText('Business name')).toBeNull();
    expect(screen.queryByText('Save and continue')).toBeNull();

    (fetchDealerApplication as jest.Mock).mockResolvedValue(business);
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByLabelText('Business name').props.value).toBe('Green Inputs'));
  });

  it('never starts a new expert application when loading the existing one failed (AU-12)', async () => {
    signedInAs({ role: 'expert', account_status: 'rejected' });
    (fetchExpertProfile as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    await renderWithQuery(<ApplicationWizardScreen />);

    expect(await screen.findByText("Couldn't load your saved details")).toBeTruthy();
    expect(screen.queryByText('Save and continue')).toBeNull();
    expect(createExpertApplication).not.toHaveBeenCalled();
  });

  it('shows the review as loading, not as empty, while the application is still on its way (AU-12)', async () => {
    signedInAs({ role: 'dealer', account_status: 'pending', application_submitted_at: '2026-10-12T08:00:00Z' });
    (fetchDealerApplication as jest.Mock).mockReturnValue(new Promise(() => undefined));
    await renderWithQuery(<ApplicationWizardScreen />);
    expect(screen.getAllByLabelText('Loading your saved details').length).toBeGreaterThan(0);
    expect(screen.queryByText('Not filled in')).toBeNull();
  });

  it('steps back when the system Back is used inside the application, and only leaves from the first step (AU-15)', async () => {
    signedInAs({ role: 'dealer' });
    (fetchDealerApplication as jest.Mock).mockResolvedValue(business);
    (saveDealerApplication as jest.Mock).mockResolvedValue(business);
    await renderWithQuery(<ApplicationWizardScreen />);
    await waitFor(() => expect(screen.getByLabelText('Business name').props.value).toBe('Green Inputs'));
    // First step: nothing is intercepted, so Back leaves the application.
    expect(mockBeforeRemove).toBeUndefined();

    await fireEvent.press(screen.getByText('Save and continue'));
    await screen.findByText('Continue to review');
    const preventDefault = jest.fn();
    await act(async () => {
      mockBeforeRemove?.({ preventDefault });
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText('Business name')).toBeTruthy();
  });
});
