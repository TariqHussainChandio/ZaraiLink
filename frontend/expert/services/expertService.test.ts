import { apiFetch } from '../../services/api/client';

jest.mock('../../services/api/client');
jest.mock('../../services/supabase/client', () => {
  const { makeSupabaseMock } = jest.requireActual('../../testUtils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

import { supabase } from '../../services/supabase/client';
import { makeSupabaseMock } from '../../testUtils/supabaseMock';
import {
  fetchExpertById,
  fetchExpertForAdminById,
  fetchExpertProfile,
  fetchExperts,
  fetchExpertsForAdmin,
  resolveExpertDocumentUrl,
  reviewExpertVerification,
  submitExpertApplication,
  updateExpertProfile,
  uploadExpertDocument,
  type ExpertProfileInput,
} from './expertService';

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedSupabase = supabase as unknown as ReturnType<typeof makeSupabaseMock>;

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
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as never),
  ) as never;
});

describe('submitExpertApplication', () => {
  it('POSTs the mapped profile plus the document path', async () => {
    mockApiFetch.mockResolvedValue({});
    await submitExpertApplication(profileInput, 'expert-1/doc.pdf');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert/application', {
      method: 'POST',
      body: { profile: apiProfile, document_path: 'expert-1/doc.pdf' },
    });
  });

  it('accepts a null document path', async () => {
    mockApiFetch.mockResolvedValue({});
    await submitExpertApplication(profileInput, null);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert/application', {
      method: 'POST',
      body: { profile: apiProfile, document_path: null },
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
  it('unwraps the url field', async () => {
    mockApiFetch.mockResolvedValue({ url: 'https://example.com/signed' });
    const result = await resolveExpertDocumentUrl('expert-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert/admin/expert-1/document-url');
    expect(result).toBe('https://example.com/signed');
  });

  it('returns null when there is no document', async () => {
    mockApiFetch.mockResolvedValue({ url: null });
    const result = await resolveExpertDocumentUrl('expert-1');
    expect(result).toBeNull();
  });
});

describe('uploadExpertDocument', () => {
  it('returns null without uploading when there is no file uri', async () => {
    const result = await uploadExpertDocument('user-1', { uri: '' });
    expect(result).toBeNull();
    expect(mockedSupabase.storage.from).not.toHaveBeenCalled();
  });

  it('uploads to the private expert-documents bucket and returns the storage path', async () => {
    const uploadMock = jest.fn(() => Promise.resolve({ data: {}, error: null }));
    mockedSupabase.storage.from.mockReturnValue({ upload: uploadMock, getPublicUrl: jest.fn() } as never);

    const path = await uploadExpertDocument('user-1', {
      uri: 'file:///tmp/cert.pdf',
      fileName: 'cert.pdf',
      mimeType: 'application/pdf',
    });

    expect(mockedSupabase.storage.from).toHaveBeenCalledWith('expert-documents');
    expect(uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/\d+-\d+\.pdf$/),
      expect.any(ArrayBuffer),
      { contentType: 'application/pdf' },
    );
    expect(path).toMatch(/^user-1\/\d+-\d+\.pdf$/);
  });

  it('throws when the upload fails', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      upload: jest.fn(() => Promise.resolve({ data: null, error: new Error('upload failed') })),
      getPublicUrl: jest.fn(),
    } as never);

    await expect(
      uploadExpertDocument('user-1', { uri: 'file:///tmp/cert.pdf' }),
    ).rejects.toThrow('upload failed');
  });
});
