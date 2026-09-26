import { apiFetch } from '../../api/client';

jest.mock('../../api/client');
jest.mock('../../supabase/client', () => {
  const { makeSupabaseMock } = jest.requireActual('../../../testUtils/supabaseMock');
  // No storagePublicUrl option — the disease-images bucket is private (security fix C2), so
  // this module never calls getPublicUrl.
  return { supabase: makeSupabaseMock() };
});

import { supabase } from '../../supabase/client';
import { makeSupabaseMock } from '../../../testUtils/supabaseMock';
import { createDiseaseCase, fetchDiseaseCaseWithPrediction, predictDisease, uploadDiseaseImage } from './diseaseService';

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedSupabase = supabase as unknown as ReturnType<typeof makeSupabaseMock>;

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as never),
  ) as never;
});

describe('uploadDiseaseImage', () => {
  it('throws when no image uri is provided', async () => {
    await expect(uploadDiseaseImage('user-1', { uri: '' })).rejects.toThrow('No image selected');
  });

  // Security fix C2: the bucket is now private, so upload returns the storage PATH — never a
  // public URL, which would no longer even resolve. getPublicUrl is deliberately not called.
  it('uploads to the disease-images bucket and returns the storage path', async () => {
    const uploadMock = jest.fn(() => Promise.resolve({ data: {}, error: null }));
    const getPublicUrlMock = jest.fn();
    mockedSupabase.storage.from.mockReturnValue({
      upload: uploadMock,
      getPublicUrl: getPublicUrlMock,
    } as never);

    const path = await uploadDiseaseImage('user-1', { uri: 'file:///tmp/leaf.jpg', fileName: 'leaf.jpg', mimeType: 'image/jpeg' });

    expect(mockedSupabase.storage.from).toHaveBeenCalledWith('disease-images');
    expect(uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/\d+-\d+\.jpg$/),
      expect.any(ArrayBuffer),
      { contentType: 'image/jpeg' },
    );
    expect(path).toMatch(/^user-1\/\d+-\d+\.jpg$/);
    expect(getPublicUrlMock).not.toHaveBeenCalled();
  });

  // extensionFromMimeType (security fix H2): the extension comes from the picker's mimeType,
  // not the client-controlled fileName — a mismatched fileName no longer changes the stored
  // extension.
  it('derives the extension from mimeType, not the (possibly mismatched) fileName', async () => {
    const uploadMock = jest.fn(() => Promise.resolve({ data: {}, error: null }));
    mockedSupabase.storage.from.mockReturnValue({ upload: uploadMock, getPublicUrl: jest.fn() } as never);

    await uploadDiseaseImage('user-1', { uri: 'file:///tmp/leaf', fileName: 'leaf.png', mimeType: 'image/jpeg' });

    expect(uploadMock).toHaveBeenCalledWith(expect.stringMatching(/\.jpg$/), expect.any(ArrayBuffer), expect.anything());
  });

  it('throws when the upload fails', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      upload: jest.fn(() => Promise.resolve({ data: null, error: new Error('quota exceeded') })),
      getPublicUrl: jest.fn(),
    } as never);

    await expect(uploadDiseaseImage('user-1', { uri: 'file:///tmp/leaf.jpg' })).rejects.toThrow('quota exceeded');
  });
});

describe('createDiseaseCase', () => {
  it('POSTs cropId/storagePath mapped to snake_case', async () => {
    mockApiFetch.mockResolvedValue({});
    await createDiseaseCase('crop-1', 'user-1/leaf.jpg');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/disease/cases', {
      method: 'POST',
      body: { crop_id: 'crop-1', storage_path: 'user-1/leaf.jpg' },
    });
  });

  it('accepts a null cropId', async () => {
    mockApiFetch.mockResolvedValue({});
    await createDiseaseCase(null, 'user-1/leaf.jpg');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/disease/cases', {
      method: 'POST',
      body: { crop_id: null, storage_path: 'user-1/leaf.jpg' },
    });
  });
});

describe('predictDisease', () => {
  it('POSTs the disease case id', async () => {
    mockApiFetch.mockResolvedValue({});
    await predictDisease('case-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/disease/predict', {
      method: 'POST',
      body: { disease_case_id: 'case-1' },
    });
  });

  it('propagates a failure (e.g. the 503 placeholder-model response) to the caller', async () => {
    mockApiFetch.mockRejectedValue(new Error('Service Unavailable'));
    await expect(predictDisease('case-1')).rejects.toThrow('Service Unavailable');
  });
});

describe('fetchDiseaseCaseWithPrediction', () => {
  it('fetches a single case with its prediction', async () => {
    mockApiFetch.mockResolvedValue({});
    await fetchDiseaseCaseWithPrediction('case-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/disease/cases/case-1');
  });
});
