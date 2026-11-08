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

function renderFor(role: 'dealer' | 'expert') {
  return renderWithQuery(
    <ApplicationDetailScreen
      navigation={{ navigate: jest.fn() } as never}
      route={{ key: 'k', name: ADMIN_HOME_ROUTES.ApplicationDetail, params: { role, id: role === 'dealer' ? 'dealer-1' : 'expert-1' } }}
    />,
  );
}

// The decision bar and the confirmation sheet can each hold a button of the same name; the sheet is the later one.
const lastButton = (name: string) => {
  const found = screen.getAllByRole('button', { name });
  const button = found[found.length - 1];
  if (!button) throw new Error(`no button ${name}`);
  return button;
};

beforeEach(() => {
  jest.clearAllMocks();
  (fetchDealerApplication as jest.Mock).mockResolvedValue(dealer());
});

describe('ApplicationDetailScreen (SRDS §12, D4)', () => {
  it('puts the applicant and where the application stands first', async () => {
    await renderFor('dealer');
    expect(await screen.findByText('Dealer Bilal')).toBeTruthy();
    expect(screen.getByText('Under review')).toBeTruthy();
    expect(screen.getByText(/Dealer · sent 12 Oct, waiting \d+ days? · \+923001234567/)).toBeTruthy();
  });

  it('names each document by what it is, not by its file name, and shows the business details', async () => {
    await renderFor('dealer');
    expect(await screen.findByText('Business licence')).toBeTruthy();
    expect(screen.getByText('Business registration certificate')).toBeTruthy();
    expect(screen.getByText('PDF · 4 KB')).toBeTruthy();
    expect(screen.getByText('Photo · 2 KB')).toBeTruthy();
    expect(screen.queryByText('licence.pdf')).toBeNull();
    expect(screen.queryByText('certificate.jpg')).toBeNull();
    expect(screen.getByText('Business details')).toBeTruthy();
    expect(screen.getByText('Hyderabad Agri Inputs')).toBeTruthy();
    expect(screen.getByText('Wholesaler')).toBeTruthy();
    expect(screen.getByText('NTN-4455')).toBeTruthy();
    expect(screen.getByText('Hyderabad, Sindh, Pakistan')).toBeTruthy();
  });

  it('marks the section headings as headings', async () => {
    await renderFor('dealer');
    await screen.findByText('Documents');
    expect(screen.getByRole('header', { name: 'Documents' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Business details' })).toBeTruthy();
  });

  it('opens a PDF in the phone’s viewer from its own signed link', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    (resolveDealerDocumentUrl as jest.Mock).mockImplementation((_d: string, id: string) => Promise.resolve(`https://signed/${id}`));
    await renderFor('dealer');

    await fireEvent.press(await screen.findByRole('button', { name: /^Business licence,/ }));

    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://signed/doc-pdf'));
    expect(resolveDealerDocumentUrl).toHaveBeenCalledWith('dealer-1', 'doc-pdf');
    openURL.mockRestore();
  });

  it('opens a photo in the zoomable viewer, named by its requirement', async () => {
    (resolveDealerDocumentUrl as jest.Mock).mockImplementation((_d: string, id: string) => Promise.resolve(`https://signed/${id}`));
    await renderFor('dealer');

    await fireEvent.press(await screen.findByRole('button', { name: /^Business registration certificate,/ }));

    expect(await screen.findByLabelText('Business registration certificate')).toBeTruthy();
    expect(resolveDealerDocumentUrl).toHaveBeenCalledWith('dealer-1', 'doc-img');
    // Only the photographed documents are in the viewer; the PDF opens elsewhere.
    expect(resolveDealerDocumentUrl).not.toHaveBeenCalledWith('dealer-1', 'doc-pdf');
  });

  it('approves only after a confirmation that says the applicant is emailed, then says the same verb (AD-05)', async () => {
    (decideDealerApplication as jest.Mock).mockResolvedValue({ role: 'dealer', previous_status: 'pending', new_status: 'approved', email_delivered: true });
    await renderFor('dealer');
    await fireEvent.press(await screen.findByRole('button', { name: 'Approve dealer' }));

    expect(await screen.findByText('Approve Dealer Bilal?')).toBeTruthy();
    expect(screen.getByText(/Dealer Bilal is emailed and can sell on ZaraiLink at once/)).toBeTruthy();
    expect(decideDealerApplication).not.toHaveBeenCalled();

    await fireEvent.press(lastButton('Approve dealer'));

    expect(decideDealerApplication).toHaveBeenCalledWith('dealer-1', 'approved', undefined);
    expect(await screen.findByText('Dealer approved')).toBeTruthy();
    expect(screen.getByText('Dealer Bilal was emailed.')).toBeTruthy();
  });

  it('rejects only with a reason of ten characters, shown as help before it is an error', async () => {
    (decideDealerApplication as jest.Mock).mockResolvedValue({ role: 'dealer', previous_status: 'pending', new_status: 'rejected', email_delivered: false });
    await renderFor('dealer');
    await fireEvent.press(await screen.findByRole('button', { name: 'Reject…' }));

    expect(await screen.findByText(/At least 10 characters/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'short');
    expect(await screen.findByText('Write at least 10 characters')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reject application' }));
    expect(decideDealerApplication).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Reason'), 'The business licence has expired.');
    await fireEvent.press(screen.getByRole('button', { name: 'Reject application' }));

    await waitFor(() => expect(decideDealerApplication).toHaveBeenCalledWith('dealer-1', 'rejected', 'The business licence has expired.'));
    expect(await screen.findByText('Application rejected')).toBeTruthy();
    expect(screen.getByText(/could not be sent/)).toBeTruthy();
  });

  it('fills the reason from a chip', async () => {
    await renderFor('dealer');
    await fireEvent.press(await screen.findByRole('button', { name: 'Reject…' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'A document is unclear' }));
    expect(screen.getByLabelText('Reason').props.value).toBe('A document is unclear');
  });

  it('keeps the typed reason when the rejection fails, so nothing is written twice (AD-05)', async () => {
    (decideDealerApplication as jest.Mock).mockRejectedValue(new Error('network'));
    await renderFor('dealer');
    await fireEvent.press(await screen.findByRole('button', { name: 'Reject…' }));
    await fireEvent.changeText(await screen.findByLabelText('Reason'), 'The business licence has expired.');
    await fireEvent.press(screen.getByRole('button', { name: 'Reject application' }));

    expect(await screen.findByText("Couldn't finish")).toBeTruthy();
    expect(screen.getByLabelText('Reason').props.value).toBe('The business licence has expired.');
  });

  it('offers no decision on a decided application, and shows the reason it was not approved', async () => {
    (fetchDealerApplication as jest.Mock).mockResolvedValue(dealer({ account_status: 'rejected', account_status_reason: 'Licence expired.' }));
    await renderFor('dealer');
    expect(await screen.findByText('Licence expired.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve dealer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject…' })).toBeNull();
  });

  it('offers no decision on a draft that was never sent', async () => {
    (fetchDealerApplication as jest.Mock).mockResolvedValue(dealer({ application_submitted_at: null }));
    await renderFor('dealer');
    expect(await screen.findByText('Dealer Bilal')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve dealer' })).toBeNull();
  });

  it('says the load failed and tries again', async () => {
    (fetchDealerApplication as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await renderFor('dealer');
    expect(await screen.findByText("Couldn't load this application")).toBeTruthy();

    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Dealer Bilal')).toBeTruthy();
  });

  it('shows an expert’s professional details and specializations, and decides it', async () => {
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
    expect(screen.getByText('Professional details')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('Sindh Agriculture University')).toBeTruthy();
    expect(screen.getByText('Plant diseases')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Degree certificate,/ }));
    await waitFor(() => expect(resolveExpertDocumentUrl).toHaveBeenCalledWith('expert-1', 'edoc'));

    await fireEvent.press(screen.getByRole('button', { name: 'Approve expert' }));
    expect(await screen.findByText('Approve Dr Sana?')).toBeTruthy();
    await fireEvent.press(lastButton('Approve expert'));
    await waitFor(() => expect(reviewExpertVerification).toHaveBeenCalledWith('expert-1', 'approved', ''));
    expect(await screen.findByText('Expert approved')).toBeTruthy();
    expect(fetchDealerApplication).not.toHaveBeenCalled();
  });
});
