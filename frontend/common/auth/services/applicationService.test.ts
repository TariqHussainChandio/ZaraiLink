import { apiFetch } from '../../../services/api/client';

jest.mock('../../../services/api/client');
jest.mock('../../../services/supabase/client', () => {
  const { makeSupabaseMock } = jest.requireActual('../../../testUtils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

import { supabase } from '../../../services/supabase/client';
import type { makeSupabaseMock } from '../../../testUtils/supabaseMock';
import { attachDocument, removeDocument, saveDealerApplication, submitApplication } from './applicationService';

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedSupabase = supabase as unknown as ReturnType<typeof makeSupabaseMock>;
const file = { uri: 'file:///cache/licence.pdf', mimeType: 'application/pdf', fileName: 'licence.pdf' };

let upload: jest.Mock;
let remove: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  upload = jest.fn(() => Promise.resolve({ data: {}, error: null }));
  remove = jest.fn(() => Promise.resolve({ data: [], error: null }));
  mockedSupabase.storage.from.mockReturnValue({ upload, remove } as never);
  globalThis.fetch = jest.fn(() => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as never)) as never;
});

describe('attachDocument', () => {
  it('uploads into the applicant’s own folder of the dealer bucket, then attaches the file through the API', async () => {
    mockApiFetch.mockResolvedValue({ id: 'doc-1' });
    await attachDocument('dealer', 'user-1', file, 'req-1');

    expect(mockedSupabase.storage.from).toHaveBeenCalledWith('dealer-documents');
    const [path] = upload.mock.calls[0] as [string];
    expect(path).toMatch(/^user-1\/\d+-\d+\.pdf$/);
    expect(upload).toHaveBeenCalledWith(path, expect.any(ArrayBuffer), { contentType: 'application/pdf' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dealer/application/documents', {
      method: 'POST',
      body: { storage_path: path, file_name: 'licence.pdf', required_document_id: 'req-1' },
    });
  });

  it('uses the expert bucket and route for an expert', async () => {
    mockApiFetch.mockResolvedValue({ id: 'doc-1' });
    await attachDocument('expert', 'user-2', { ...file, mimeType: 'image/jpeg', fileName: 'degree.jpg' }, null);
    expect(mockedSupabase.storage.from).toHaveBeenCalledWith('expert-documents');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/expert/application/documents', expect.anything());
  });

  it('removes the uploaded file again when the attach is refused, so nothing is left behind', async () => {
    mockApiFetch.mockRejectedValue(new Error('application_locked'));
    await expect(attachDocument('dealer', 'user-1', file, 'req-1')).rejects.toThrow('application_locked');
    const [path] = upload.mock.calls[0] as [string];
    expect(remove).toHaveBeenCalledWith([path]);
  });

  it('stops before the API when the upload itself fails', async () => {
    upload.mockResolvedValue({ data: null, error: new Error('The object exceeded the maximum allowed size') });
    await expect(attachDocument('dealer', 'user-1', file, null)).rejects.toThrow('maximum allowed size');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('the other calls', () => {
  it('saves the business details, submits, and removes a document on their routes', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    const business = {
      business_name: 'Green Inputs',
      business_type: 'wholesaler' as const,
      registration_number: 'NTN-1',
      business_address: '1 Main Road',
      country: 'Pakistan',
      province: 'Sindh',
      city: 'Hyderabad',
    };
    await saveDealerApplication(business);
    await submitApplication();
    await removeDocument('expert', 'doc-9');
    expect(mockApiFetch).toHaveBeenNthCalledWith(1, '/api/v1/dealer/application', { method: 'PUT', body: business });
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, '/api/v1/profile/application/submit', { method: 'POST' });
    expect(mockApiFetch).toHaveBeenNthCalledWith(3, '/api/v1/expert/application/documents/doc-9', { method: 'DELETE' });
  });
});
