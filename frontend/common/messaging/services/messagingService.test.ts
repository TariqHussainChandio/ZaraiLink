import type { PickedPhoto } from '../../../utils/photoPicker';
import { apiFetch } from '../../../services/api/client';

jest.mock('../../../services/api/client');
jest.mock('../../../services/supabase/client', () => {
  const { makeSupabaseMock } = jest.requireActual('../../../testUtils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

import { supabase } from '../../../services/supabase/client';
import { makeSupabaseMock } from '../../../testUtils/supabaseMock';
import {
  fetchConversations,
  fetchMessageById,
  fetchMessages,
  findOrCreateConversation,
  markConversationRead,
  redactMessage,
  resolveAttachmentUrls,
  sendMessage,
  uploadMessageAttachments,
} from './messagingService';

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedSupabase = supabase as unknown as ReturnType<typeof makeSupabaseMock>;

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as never),
  ) as never;
});

describe('reads', () => {
  it('fetchConversations fetches the caller-scoped list', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchConversations();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/messaging/conversations');
  });

  it('fetchMessages fetches a conversation thread', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchMessages('conv-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/messaging/conversations/conv-1/messages');
  });

  it('fetchMessageById fetches a single message', async () => {
    mockApiFetch.mockResolvedValue({});
    await fetchMessageById('msg-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/messaging/messages/msg-1');
  });
});

describe('sendMessage', () => {
  it('POSTs body/attachments, no explicit senderId', async () => {
    mockApiFetch.mockResolvedValue({});
    await sendMessage('conv-1', 'Hello', ['a.jpg']);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/messaging/conversations/conv-1/messages', {
      method: 'POST',
      body: { body: 'Hello', attachments: ['a.jpg'] },
    });
  });

  it('defaults attachments to an empty array', async () => {
    mockApiFetch.mockResolvedValue({});
    await sendMessage('conv-1', 'Hello');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/messaging/conversations/conv-1/messages', {
      method: 'POST',
      body: { body: 'Hello', attachments: [] },
    });
  });
});

describe('uploadMessageAttachments', () => {
  const withUri = (uri: string): PickedPhoto => ({ uri, fileName: `${uri}.jpg`, mimeType: 'image/jpeg' });

  it('uploads each image under conversationId/senderId and returns the paths', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      upload: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      getPublicUrl: jest.fn(),
    } as never);

    const paths = await uploadMessageAttachments('conv-1', 'user-1', [withUri('a')]);

    expect(mockedSupabase.storage.from).toHaveBeenCalledWith('message-attachments');
    expect(paths[0]).toMatch(/^conv-1\/user-1\/\d+-\d+\.jpg$/);
  });

  it('skips assets with no uri', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      upload: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      getPublicUrl: jest.fn(),
    } as never);
    const paths = await uploadMessageAttachments('conv-1', 'user-1', [{ uri: '' }]);
    expect(paths).toEqual([]);
  });

  it('throws when an upload fails', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      upload: jest.fn(() => Promise.resolve({ data: null, error: new Error('upload failed') })),
      getPublicUrl: jest.fn(),
    } as never);
    await expect(uploadMessageAttachments('conv-1', 'user-1', [withUri('a')])).rejects.toThrow('upload failed');
  });
});

describe('resolveAttachmentUrls', () => {
  it('short-circuits to an empty object for no paths', async () => {
    const result = await resolveAttachmentUrls([]);
    expect(result).toEqual({});
    expect(mockedSupabase.storage.from).not.toHaveBeenCalled();
  });

  it('signs for a 1-hour TTL and builds a path -> url map', async () => {
    const createSignedUrls = jest.fn(() =>
      Promise.resolve({ data: [{ path: 'a.jpg', signedUrl: 'https://example.com/a' }], error: null }),
    );
    mockedSupabase.storage.from.mockReturnValue({ createSignedUrls } as never);

    const result = await resolveAttachmentUrls(['a.jpg']);

    expect(createSignedUrls).toHaveBeenCalledWith(['a.jpg'], 3600);
    expect(result).toEqual({ 'a.jpg': 'https://example.com/a' });
  });

  it('throws when signing fails', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      createSignedUrls: jest.fn(() => Promise.resolve({ data: null, error: new Error('expired') })),
    } as never);
    await expect(resolveAttachmentUrls(['a.jpg'])).rejects.toThrow('expired');
  });
});

describe('findOrCreateConversation', () => {
  it('POSTs the other participant id', async () => {
    mockApiFetch.mockResolvedValue({});
    await findOrCreateConversation('user-2');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/messaging/conversations', {
      method: 'POST',
      body: { other_user_id: 'user-2' },
    });
  });
});

describe('redactMessage / markConversationRead', () => {
  it('PATCHes the redact endpoint', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await redactMessage('msg-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/messaging/messages/msg-1/redact', { method: 'PATCH' });
  });

  it('PATCHes the read-receipt endpoint', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await markConversationRead('conv-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/messaging/conversations/conv-1/read', { method: 'PATCH' });
  });
});
