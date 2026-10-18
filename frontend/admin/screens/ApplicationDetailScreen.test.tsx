import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { ApplicationDetailScreen } from './ApplicationDetailScreen';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import { decideDealerApplication, fetchDealerApplication, resolveDealerDocumentUrl } from '../services/adminService';
import { fetchExpertForAdminById, resolveExpertDocumentUrl, reviewExpertVerification } from '../../expert/services/expertService';

jest.mock('../services/adminService', () => ({
  decideDealerApplication: jest.fn(),
  fetchDealerApplication: jest.fn(),
  resolveDealerDocumentUrl: jest.fn(),
}));
jest.mock('../../expert/services/expertService', () => ({
  fetchExpertForAdminById: jest.fn(),
  resolveExpertDocumentUrl: jest.fn(),
  reviewExpertVerification: jest.fn(),
}));

const pdf = { id: 'doc-pdf', required_document_id: 'r1', file_name: 'licence.pdf', mime_type: 'application/pdf', size_bytes: 4096, created_at: '', required_document: { id: 'r1', code: 'business_licence', label: 'Business licence' } };
const photo = { id: 'doc-img', required_document_id: 'r2', file_name: 'certificate.jpg', mime_type: 'image/jpeg', size_bytes: 2048, created_at: '', required_document: { id: 'r2', code: 'business_registration', label: 'Business registration certificate' } };
const dealer = (overrides = {}) => ({
  id: 'dealer-1',
  full_name: 'Dealer Bilal',
  phone: '+923001234567',
  account_status: 'pending',
  account_status_reason: null,
  application_submitted_at: '2026-10-12T08:00:00Z',
  created_at: '2026-10-10T08:00:00Z',
  dealer_profile: {
    business_name: 'Hyderabad Agri Inputs',
    business_type: 'wholesaler',
    registration_number: 'NTN-4455',
    business_address: '7 Grain Market Road',
    country: 'Pakistan',
    province: 'Sindh',
    city: 'Hyderabad',
  },
  dealer_documents: [pdf, photo],
  ...overrides,
});

function renderFor(role: 'dealer' | 'expert', navigate = jest.fn()) {
  const navigation = { navigate } as never;
  return renderWithQuery(
    <ApplicationDetailScreen navigation={navigation} route={{ key: 'k', name: ADMIN_HOME_ROUTES.ApplicationDetail, params: { role, id: role === 'dealer' ? 'dealer-1' : 'expert-1' } }} />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (fetchDealerApplication as jest.Mock).mockResolvedValue(dealer());
});

describe('ApplicationDetailScreen (SRDS §12)', () => {
  it('shows the dealer, the business information and the submitted documents', async () => {
    await renderFor('dealer');
    expect(await screen.findByText('Dealer Bilal')).toBeTruthy();
    expect(screen.getByText('Business information')).toBeTruthy();
    expect(screen.getByText('Hyderabad Agri Inputs')).toBeTruthy();
    expect(screen.getByText('Wholesaler')).toBeTruthy();
    expect(screen.getByText('NTN-4455')).toBeTruthy();
    expect(screen.getByText('Hyderabad, Sindh, Pakistan')).toBeTruthy();
    expect(screen.getByText('Business licence')).toBeTruthy();
    expect(screen.getByText('licence.pdf')).toBeTruthy();
    expect(screen.getByText('certificate.jpg')).toBeTruthy();
  });

  it('opens a PDF in the phone’s viewer and a photo in the app, each from its own signed link', async () => {
    const navigate = jest.fn();
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    (resolveDealerDocumentUrl as jest.Mock).mockImplementation((_d: string, id: string) => Promise.resolve(`https://signed/${id}`));
    await renderFor('dealer', navigate);

    await fireEvent.press(await screen.findByLabelText('View licence.pdf'));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://signed/doc-pdf'));
    expect(resolveDealerDocumentUrl).toHaveBeenCalledWith('dealer-1', 'doc-pdf');

    await fireEvent.press(screen.getByLabelText('View certificate.jpg'));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.DocumentViewer, { url: 'https://signed/doc-img', title: 'certificate.jpg' }),
    );
    openURL.mockRestore();
  });

  it('approves, and says the dealer was emailed', async () => {
    (decideDealerApplication as jest.Mock).mockResolvedValue({ role: 'dealer', previous_status: 'pending', new_status: 'approved', email_delivered: true });
    await renderFor('dealer');
    await fireEvent.press(await screen.findByText('Approve'));
    // The button only asks; the sheet's button decides.
    expect(decideDealerApplication).not.toHaveBeenCalled();
    expect(screen.getByText('The dealer can sell on the marketplace once they sign in again.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Approve application'));
    expect(decideDealerApplication).toHaveBeenCalledWith('dealer-1', 'approved', undefined);
    expect(await screen.findByText('The applicant has been emailed.')).toBeTruthy();
  });

  it('backing out of the approval decides nothing', async () => {
    await renderFor('dealer');
    await fireEvent.press(await screen.findByText('Approve'));
    await fireEvent.press(screen.getByText('Not now'));
    expect(screen.queryByText('Approve application')).toBeNull();
    expect(decideDealerApplication).not.toHaveBeenCalled();
  });

  it('rejects only with a reason the dealer can read, and says when the email could not be sent', async () => {
    (decideDealerApplication as jest.Mock).mockResolvedValue({ role: 'dealer', previous_status: 'pending', new_status: 'rejected', email_delivered: false });
    await renderFor('dealer');
    await fireEvent.press(await screen.findByText('Reject'));
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'short');
    await fireEvent.press(screen.getByText('Reject application'));
    expect(await screen.findByText('Write at least 10 characters')).toBeTruthy();
    expect(decideDealerApplication).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Reason'), 'The business licence has expired.');
    await fireEvent.press(screen.getByText('Reject application'));
    await waitFor(() => expect(decideDealerApplication).toHaveBeenCalledWith('dealer-1', 'rejected', 'The business licence has expired.'));
    expect(await screen.findByText(/could not be sent/)).toBeTruthy();
  });

  it('offers no decision on a draft or a decided application, and shows a rejection’s reason', async () => {
    (fetchDealerApplication as jest.Mock).mockResolvedValue(dealer({ account_status: 'rejected', account_status_reason: 'Licence expired.' }));
    await renderFor('dealer');
    expect(await screen.findByText('Licence expired.')).toBeTruthy();
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Reject')).toBeNull();
  });

  it('shows an expert’s professional information, experience, institution and specializations, and decides it', async () => {
    (fetchExpertForAdminById as jest.Mock).mockResolvedValue({
      id: 'expert-1',
      qualifications: 'MSc Plant Pathology',
      degree: 'MSc',
      experience: 'Extension officer',
      professional_description: null,
      years_experience: 8,
      institution_affiliation: 'Sindh Agriculture University',
      profile: { id: 'expert-1', full_name: 'Dr Sana', avatar_url: null, phone: null, account_status: 'pending', account_status_reason: null, application_submitted_at: '2026-10-12T08:00:00Z' },
      expert_specializations: [{ specialization: 'plant_diseases' }],
      expert_verifications: [],
      expert_documents: [{ ...pdf, id: 'edoc', file_name: 'degree.pdf', required_document: { id: 'r3', code: 'degree', label: 'Degree certificate' } }],
    });
    (reviewExpertVerification as jest.Mock).mockResolvedValue({ role: 'expert', previous_status: 'pending', new_status: 'approved', email_delivered: true });
    (resolveExpertDocumentUrl as jest.Mock).mockResolvedValue('https://signed/edoc');
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderFor('expert');

    expect(await screen.findByText('Dr Sana')).toBeTruthy();
    expect(screen.getByText('Professional information')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('Sindh Agriculture University')).toBeTruthy();
    expect(screen.getByText('Plant Diseases')).toBeTruthy();
    expect(screen.getByText('Degree certificate')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('View degree.pdf'));
    await waitFor(() => expect(resolveExpertDocumentUrl).toHaveBeenCalledWith('expert-1', 'edoc'));

    await fireEvent.press(screen.getByText('Approve'));
    await fireEvent.press(screen.getByText('Approve application'));
    expect(reviewExpertVerification).toHaveBeenCalledWith('expert-1', 'approved', '');
    expect(fetchDealerApplication).not.toHaveBeenCalled();
  });
});
