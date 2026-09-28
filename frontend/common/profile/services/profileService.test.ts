import type { PickedPhoto } from '../../../utils/photoPicker';
import { apiFetch } from '../../../services/api/client';

jest.mock('../../../services/api/client');
jest.mock('../../../services/supabase/client', () => {
  const { makeSupabaseMock } = jest.requireActual('../../../testUtils/supabaseMock');
  return { supabase: makeSupabaseMock({ storagePublicUrl: 'https://example.supabase.co/storage/avatar.jpg' }) };
});

import { supabase } from '../../../services/supabase/client';
import { makeSupabaseMock } from '../../../testUtils/supabaseMock';
import { updatePassword, updateProfile, uploadAvatar } from './profileService';

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedSupabase = supabase as unknown as ReturnType<typeof makeSupabaseMock>;

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as never),
  ) as never;
});

describe('updateProfile', () => {
  it('PATCHes only the fields provided', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await updateProfile({ full_name: 'New Name', notifications_enabled: false });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/profile', {
      method: 'PATCH',
      body: { full_name: 'New Name', notifications_enabled: false },
    });
  });
});

describe('uploadAvatar', () => {
  const image: PickedPhoto = { uri: 'file:///tmp/photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' };

  it('throws when no image uri is provided', async () => {
    await expect(uploadAvatar('user-1', { uri: '' })).rejects.toThrow('No image selected');
  });

  it('uploads to the avatars bucket under the user id and returns the public URL', async () => {
    const uploadMock = jest.fn(() => Promise.resolve({ data: { path: 'mock' }, error: null }));
    const getPublicUrlMock = jest.fn(() => ({
      data: { publicUrl: 'https://example.supabase.co/storage/avatar.jpg' },
    }));
    mockedSupabase.storage.from.mockReturnValue({
      upload: uploadMock,
      getPublicUrl: getPublicUrlMock,
    } as never);

    const url = await uploadAvatar('user-1', image);

    expect(mockedSupabase.storage.from).toHaveBeenCalledWith('avatars');
    expect(uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/avatar-\d+\.jpg$/),
      expect.any(ArrayBuffer),
      { contentType: 'image/jpeg' },
    );
    expect(url).toBe('https://example.supabase.co/storage/avatar.jpg');
  });

  it('throws when the upload fails', async () => {
    mockedSupabase.storage.from.mockReturnValue({
      upload: jest.fn(() => Promise.resolve({ data: null, error: new Error('bucket full') })),
      getPublicUrl: jest.fn(),
    } as never);

    await expect(uploadAvatar('user-1', image)).rejects.toThrow('bucket full');
  });
});

describe('updatePassword', () => {
  it('calls the Supabase Auth SDK directly and signs out other sessions', async () => {
    mockedSupabase.auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null } as never);
    await updatePassword('newSecret123');
    expect(mockedSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newSecret123' });
    expect(mockedSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('still succeeds, and logs, when the other sessions cannot be signed out', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockedSupabase.auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null } as never);
    mockedSupabase.auth.signOut.mockResolvedValue({ error: new Error('network') } as never);
    await expect(updatePassword('newSecret123')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[profileService: could not sign out other sessions]', 'Error: network');
    warn.mockRestore();
  });

  it('throws on error', async () => {
    mockedSupabase.auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: new Error('password too weak'),
    } as never);
    await expect(updatePassword('weak')).rejects.toThrow('password too weak');
  });
});
