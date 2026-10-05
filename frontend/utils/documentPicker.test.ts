import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { pickApplicationDocument } from './documentPicker';
import { pickFromLibrary, takePhoto } from './photoPicker';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('./photoPicker', () => ({ pickFromLibrary: jest.fn(), takePhoto: jest.fn() }));

const mockGetDocument = DocumentPicker.getDocumentAsync as jest.Mock;
const mockTakePhoto = takePhoto as jest.Mock;
const mockLibrary = pickFromLibrary as jest.Mock;

function choose(label: string) {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons, options) => {
    if (label === 'dismiss') options?.onDismiss?.();
    else buttons?.find(b => b.text === label)?.onPress?.();
  });
}

afterEach(() => jest.restoreAllMocks());

describe('pickApplicationDocument', () => {
  it('chooses a PDF or image file from the phone, limited to what the buckets accept', async () => {
    choose('Choose file (PDF or image)');
    mockGetDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/licence.pdf', name: 'licence.pdf', mimeType: 'application/pdf', size: 4096 }],
    });
    await expect(pickApplicationDocument()).resolves.toEqual({
      uri: 'file:///cache/licence.pdf',
      mimeType: 'application/pdf',
      fileName: 'licence.pdf',
      sizeBytes: 4096,
    });
    expect(mockGetDocument).toHaveBeenCalledWith({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      copyToCacheDirectory: true,
      multiple: false,
    });
  });

  it('takes a photo of a paper document', async () => {
    choose('Take photo');
    mockTakePhoto.mockResolvedValue([{ uri: 'file:///cache/p.jpg', mimeType: 'image/jpeg', fileName: 'p.jpg' }]);
    await expect(pickApplicationDocument()).resolves.toEqual({ uri: 'file:///cache/p.jpg', mimeType: 'image/jpeg', fileName: 'p.jpg' });
  });

  it('offers no more than the three buttons Android shows, and can be dismissed instead', async () => {
    const alert = choose('dismiss');
    await expect(pickApplicationDocument()).resolves.toBeNull();
    const [, , buttons, options] = alert.mock.calls[0] ?? [];
    expect(buttons).toHaveLength(3);
    expect(options).toMatchObject({ cancelable: true });
  });

  it('resolves null when the applicant backs out of the picker', async () => {
    choose('Choose photo');
    mockLibrary.mockResolvedValue([]);
    await expect(pickApplicationDocument()).resolves.toBeNull();
    choose('Choose file (PDF or image)');
    mockGetDocument.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickApplicationDocument()).resolves.toBeNull();
  });
});
