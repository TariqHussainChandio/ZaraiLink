import { apiFetch } from '../../services/api/client';

jest.mock('../../services/api/client');

import {
  createExpertApplication,
  fetchExpertById,
  fetchExpertForAdminById,
  fetchExpertProfile,
  fetchExperts,
  fetchExpertsForAdmin,
  resolveExpertDocumentUrl,
  reviewExpertVerification,
  updateExpertProfile,
  type ExpertProfileInput,
} from './expertService';

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const profileInput: ExpertProfileInput = {
  qualifications: 'PhD Agronomy',
  degree: 'PhD',
  experience: '10 years',
  professionalDescription: 'Expert in crop disease',
  contact: '+923001234567',
  country: 'Pakistan',
  province: 'Punjab',
  city: 'Lahore',
  specializations: ['plant_diseases'],
};

const apiProfile = {
  qualifications: 'PhD Agronomy',
  degree: 'PhD',
  experience: '10 years',
  professional_description: 'Expert in crop disease',
  contact: '+923001234567',
  country: 'Pakistan',
  province: 'Punjab',
  city: 'Lahore',
  specializations: ['plant_diseases'],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createExpertApplication', () => {
  it('POSTs the mapped profile as the draft application, with no document (A3b attaches documents separately)', async () => {
    mockApiFetch.mockResolvedValue({});
    await createExpertApplication(profileInput);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert/application', { method: 'POST', body: apiProfile });
  });

  it('sends the years of experience and the institution when given', async () => {
    mockApiFetch.mockResolvedValue({});
    await createExpertApplication({ ...profileInput, yearsExperience: 8, institutionAffiliation: 'Sindh Agriculture University' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert/application', {
      method: 'POST',
      body: { ...apiProfile, years_experience: 8, institution_affiliation: 'Sindh Agriculture University' },
    });
  });
});

describe('updateExpertProfile', () => {
  it('PATCHes the mapped profile', async () => {
    mockApiFetch.mockResolvedValue({});
    await updateExpertProfile(profileInput);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert/application', {
      method: 'PATCH',
      body: apiProfile,
    });
  });
});

describe('reads', () => {
  it('fetchExpertProfile fetches the caller-scoped profile', async () => {
    mockApiFetch.mockResolvedValue(null);
    await fetchExpertProfile();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert/me');
  });

  it('fetchExpertById fetches a single expert', async () => {
    mockApiFetch.mockResolvedValue({});
    await fetchExpertById('expert-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert/expert-1');
  });

  it('fetchExperts passes the specialization filter', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchExperts({ specialization: 'plant_diseases' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert', { query: { specialization: 'plant_diseases' } });
  });

  it('fetchExpertsForAdmin passes the status filter', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchExpertsForAdmin('pending');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert/admin', { query: { status: 'pending' } });
  });

  it('fetchExpertForAdminById fetches a single admin-view expert', async () => {
    mockApiFetch.mockResolvedValue({});
    await fetchExpertForAdminById('expert-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert/admin/expert-1');
  });
});

describe('reviewExpertVerification', () => {
  it('PATCHes the decision, converting an empty notes string to null', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await reviewExpertVerification('expert-1', 'approved', '');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert/admin/expert-1/verification', {
      method: 'PATCH',
      body: { decision: 'approved', notes: null },
    });
  });

  it('keeps non-empty notes', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await reviewExpertVerification('expert-1', 'rejected', 'Missing documents');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert/admin/expert-1/verification', {
      method: 'PATCH',
      body: { decision: 'rejected', notes: 'Missing documents' },
    });
  });
});

describe('resolveExpertDocumentUrl', () => {
  it('asks for one document of one expert, by id, and unwraps the url', async () => {
    mockApiFetch.mockResolvedValue({ url: 'https://example.com/signed' });
    const result = await resolveExpertDocumentUrl('expert-1', 'doc-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert/admin/expert-1/documents/doc-1/url');
    expect(result).toBe('https://example.com/signed');
  });
});
