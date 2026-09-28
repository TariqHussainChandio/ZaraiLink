import * as ImagePicker from 'expo-image-picker';
import { Alert, type AlertButton } from 'react-native';
import { compressPhoto } from './photoCompression';
import { pickFromLibrary, pickPhotos } from './photoPicker';

jest.mock('./photoCompression');
const mockCompress = compressPhoto as jest.Mock;

const mockLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockCamera = ImagePicker.launchCameraAsync as jest.Mock;

const asset = { uri: 'file:///cache/leaf.jpg', mimeType: 'image/jpeg', fileName: 'leaf.jpg', fileSize: 1234, width: 800, height: 600 };
// What the picker hands on: the compressed copy, always a JPEG.
const photo = { uri: 'file:///cache/leaf-small.jpg', mimeType: 'image/jpeg', fileName: 'leaf.jpg', width: 400, height: 300 };

// pickPhotos shows a native alert; this presses one of its buttons the way a user would.
function pressAlertButton(text: string) {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as AlertButton[];
  buttons.find(button => button.text === text)?.onPress?.();
}

const mockRequestCamera = ImagePicker.requestCameraPermissionsAsync as jest.Mock;

beforeEach(() => {
  mockCompress.mockReset().mockResolvedValue({ uri: photo.uri, width: photo.width, height: photo.height });
  mockRequestCamera.mockReset().mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' });
  mockLibrary.mockReset().mockResolvedValue({ canceled: true, assets: null });
  mockCamera.mockReset().mockResolvedValue({ canceled: true, assets: null });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('pickFromLibrary', () => {
  it('maps picked assets to the app photo shape', async () => {
    mockLibrary.mockResolvedValue({ canceled: false, assets: [{ ...asset, fileName: null }] });

    const photos = await pickFromLibrary();

    expect(photos).toEqual([{ ...photo, fileName: undefined }]);
    expect(mockCompress).toHaveBeenCalledWith(asset.uri, 800, 600);
  });

  it('hands on the compressed JPEG, named and typed as one, whatever the original was', async () => {
    mockLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ ...asset, mimeType: 'image/png', fileName: 'field.photo.PNG' }],
    });

    expect(await pickFromLibrary()).toEqual([{ ...photo, fileName: 'field.photo.jpg' }]);
  });

  it('returns nothing when the user backs out', async () => {
    expect(await pickFromLibrary()).toEqual([]);
  });

  it('asks for photos only, at full quality, with multi-select above one', async () => {
    await pickFromLibrary({ selectionLimit: 4 });

    expect(mockLibrary).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 1,
    });
  });

  it('is single-select by default', async () => {
    await pickFromLibrary();

    expect(mockLibrary).toHaveBeenCalledWith(expect.objectContaining({ allowsMultipleSelection: false, selectionLimit: 1 }));
  });
});

describe('pickPhotos', () => {
  it('takes a photo when the user chooses the camera', async () => {
    mockCamera.mockResolvedValue({ canceled: false, assets: [asset] });

    const result = pickPhotos();
    pressAlertButton('Take Photo');

    await expect(result).resolves.toEqual([photo]);
  });

  it('opens the gallery with the requested limit', async () => {
    mockLibrary.mockResolvedValue({ canceled: false, assets: [asset] });

    const result = pickPhotos({ selectionLimit: 3 });
    pressAlertButton('Choose from Gallery');

    await expect(result).resolves.toEqual([photo]);
    expect(mockLibrary).toHaveBeenCalledWith(expect.objectContaining({ selectionLimit: 3 }));
  });

  it('resolves to nothing on Cancel without opening either picker', async () => {
    const result = pickPhotos();
    pressAlertButton('Cancel');

    await expect(result).resolves.toEqual([]);
    expect(mockCamera).not.toHaveBeenCalled();
    expect(mockLibrary).not.toHaveBeenCalled();
  });

  it('resolves to nothing, without opening the camera, when the permission is refused', async () => {
    mockRequestCamera.mockResolvedValue({ granted: false, canAskAgain: true, status: 'denied' });

    const result = pickPhotos();
    pressAlertButton('Take Photo');

    await expect(result).resolves.toEqual([]);
    expect(mockCamera).not.toHaveBeenCalled();
  });

  it.each(['ERR_USER_REJECTED_PERMISSIONS', 'ERR_MISSING_ACTIVITY_TO_HANDLE_INTENT'])(
    'resolves to nothing when the camera reports %s',
    async code => {
      mockCamera.mockRejectedValue(Object.assign(new Error('camera unavailable'), { code }));

      const result = pickPhotos();
      pressAlertButton('Take Photo');

      await expect(result).resolves.toEqual([]);
    },
  );

  it('passes any other camera failure to the caller', async () => {
    mockCamera.mockRejectedValue(Object.assign(new Error('disk full'), { code: 'ERR_FAILED_TO_WRITE_FILE' }));

    const result = pickPhotos();
    pressAlertButton('Take Photo');

    await expect(result).rejects.toThrow('disk full');
  });
});
