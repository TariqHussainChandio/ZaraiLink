import type { Asset } from 'react-native-image-picker';
import { apiFetch } from '../../api/client';

jest.mock('../../api/client');
jest.mock('../../supabase/client', () => {
  const { makeSupabaseMock } = jest.requireActual('../../../testUtils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

import { supabase } from '../../supabase/client';
import { makeSupabaseMock } from '../../../testUtils/supabaseMock';
import {
  createConsultationRequest,
  fetchConsultationById,
  fetchConsultationMessages,
  fetchConsultationsForExpert,
  fetchConsultationsForUser,
  resolveConsultationAttachmentUrls,
  sendConsultationMessage,
  updateConsultationImages,
  updateConsultationStatus,
  uploadConsultationAttachments,
} from './consultationService';

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedSupabase = supabase as unknown as ReturnType<typeof makeSupabaseMock>;

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as never),
  ) as never;
});

describe('createConsultationRequest', () => {
  it('maps every field to its snake_case API shape', async () => {
    mockApiFetch.mockResolvedValue({});
    await createConsultationRequest({
      expertId: 'expert-1',
      subject: 'Yellowing leaves',
      cropId: 'crop-1',
      problemDescription: 'Leaves turning yellow',
      farmId: 'farm-1',
      images: ['path/a.jpg'],
      priority: 'high',
    });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/consultations', {
      method: 'POST',
      body: {
        expert_id: 'expert-1',
        subject: 'Yellowing leaves',
        crop_id: 'crop-1',
        problem_description: 'Leaves turning yellow',
        farm_id: 'farm-1',
        images: ['path/a.jpg'],
        priority: 'high',
      },
    });
  });
});

describe('uploadConsultationAttachments', () => {
  const withUri = (uri: string): Asset => ({ uri, fileName: `${uri}.jpg`, type: 'image/jpeg' });

  it('uploads each image and returns their storage paths', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      upload: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      getPublicUrl: jest.fn(),
    } as never);

    const paths = await uploadConsultationAttachments('consult-1', 'user-1', [withUri('a'), withUri('b')]);

    expect(mockedSupabase.storage.from).toHaveBeenCalledWith('consultation-attachments');
    expect(paths).toHaveLength(2);
    paths.forEach(path => expect(path).toMatch(/^consult-1\/user-1\/\d+-\d+\.jpg$/));
  });

  it('skips assets with no uri', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      upload: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      getPublicUrl: jest.fn(),
    } as never);

    const paths = await uploadConsultationAttachments('consult-1', 'user-1', [{}, withUri('a')]);
    expect(paths).toHaveLength(1);
  });

  it('throws when a single upload fails', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      upload: jest.fn(() => Promise.resolve({ data: null, error: new Error('upload failed') })),
      getPublicUrl: jest.fn(),
    } as never);

    await expect(uploadConsultationAttachments('consult-1', 'user-1', [withUri('a')])).rejects.toThrow(
      'upload failed',
    );
  });
});

describe('resolveConsultationAttachmentUrls', () => {
  it('short-circuits to an empty object for an empty path list', async () => {
    const result = await resolveConsultationAttachmentUrls([]);
    expect(result).toEqual({});
    expect(mockedSupabase.storage.from).not.toHaveBeenCalled();
  });

  it('builds a path -> signedUrl map, keyed by the requested 1-hour expiry', async () => {
    const createSignedUrls = jest.fn(() =>
      Promise.resolve({
        data: [
          { path: 'a.jpg', signedUrl: 'https://example.com/a-signed' },
          { path: 'b.jpg', signedUrl: 'https://example.com/b-signed' },
        ],
        error: null,
      }),
    );
    mockedSupabase.storage.from.mockReturnValue({ createSignedUrls } as never);

    const result = await resolveConsultationAttachmentUrls(['a.jpg', 'b.jpg']);

    expect(createSignedUrls).toHaveBeenCalledWith(['a.jpg', 'b.jpg'], 3600);
    expect(result).toEqual({ 'a.jpg': 'https://example.com/a-signed', 'b.jpg': 'https://example.com/b-signed' });
  });

  it('skips entries missing a path or signedUrl', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      createSignedUrls: jest.fn(() =>
        Promise.resolve({ data: [{ path: null, signedUrl: 'x' }, { path: 'ok.jpg', signedUrl: null }], error: null }),
      ),
    } as never);

    const result = await resolveConsultationAttachmentUrls(['a.jpg']);
    expect(result).toEqual({});
  });

  it('throws when signing fails', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      createSignedUrls: jest.fn(() => Promise.resolve({ data: null, error: new Error('not found') })),
    } as never);

    await expect(resolveConsultationAttachmentUrls(['a.jpg'])).rejects.toThrow('not found');
  });
});

describe('updateConsultationImages', () => {
  it('PATCHes the image list', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await updateConsultationImages('consult-1', ['a.jpg']);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/consultations/consult-1/images', {
      method: 'PATCH',
      body: { images: ['a.jpg'] },
    });
  });
});

describe('reads', () => {
  it('fetchConsultationsForUser fetches the caller-scoped list', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchConsultationsForUser();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/consultations/mine');
  });

  it('fetchConsultationsForExpert fetches the assigned list', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchConsultationsForExpert();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/consultations/assigned');
  });

  it('fetchConsultationById fetches a single consultation', async () => {
    mockApiFetch.mockResolvedValue({});
    await fetchConsultationById('consult-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/consultations/consult-1');
  });

  it('fetchConsultationMessages fetches the message thread', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchConsultationMessages('consult-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/consultations/consult-1/messages');
  });
});

describe('updateConsultationStatus', () => {
  it('PATCHes only the destination status, no "from"', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await updateConsultationStatus('consult-1', 'accepted');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/consultations/consult-1/status', {
      method: 'PATCH',
      body: { to: 'accepted' },
    });
  });
});

describe('sendConsultationMessage', () => {
  it('POSTs body/attachments/recommendedListingId, no explicit senderId', async () => {
    mockApiFetch.mockResolvedValue({});
    await sendConsultationMessage('consult-1', 'Try neem oil', ['a.jpg'], 'listing-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/consultations/consult-1/messages', {
      method: 'POST',
      body: { body: 'Try neem oil', attachments: ['a.jpg'], recommended_listing_id: 'listing-1' },
    });
  });

  it('defaults attachments to [] and recommendedListingId to null', async () => {
    mockApiFetch.mockResolvedValue({});
    await sendConsultationMessage('consult-1', 'Hello');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/consultations/consult-1/messages', {
      method: 'POST',
      body: { body: 'Hello', attachments: [], recommended_listing_id: null },
    });
  });
});
