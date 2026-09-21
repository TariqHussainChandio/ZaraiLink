import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

/**
 * A photo the user picked or took. This is the app's own shape, so screens and services do not
 * depend on the picker library's asset type.
 */
export interface PickedPhoto {
  uri: string;
  /** MIME type such as image/jpeg. Sent as the upload Content-Type. */
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
}

export interface PickPhotosOptions {
  selectionLimit?: number;
}

// Error codes the native module reports when a permission is refused or the device has no camera
// app. The previous picker library returned both as an empty result rather than an error, and callers
// rely on that, so they resolve to "no photos" here too. Any other failure is a real fault and
// propagates.
//
// The codes are derived at runtime from the Kotlin class names, so they only match while R8 leaves
// those names alone. app.config.ts keeps them (extraProguardRules). Without that a release build
// reports an obfuscated code such as ERR_X and every refusal would look like a real fault.
const EXPECTED_CAMERA_ERROR_CODES = new Set([
  'ERR_USER_REJECTED_PERMISSIONS',
  'ERR_MISSING_ACTIVITY_TO_HANDLE_INTENT',
]);

function isExpectedCameraError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    EXPECTED_CAMERA_ERROR_CODES.has(error.code)
  );
}

function toPickedPhoto(asset: ImagePicker.ImagePickerAsset): PickedPhoto {
  return {
    uri: asset.uri,
    mimeType: asset.mimeType,
    fileName: asset.fileName ?? undefined,
    fileSize: asset.fileSize,
    width: asset.width,
    height: asset.height,
  };
}

/**
 * Opens the system photo picker (no storage permission needed). Resolves to an empty array when the
 * user backs out. `selectionLimit` above 1 allows multi-select up to that many photos.
 */
export async function pickFromLibrary({ selectionLimit = 1 }: PickPhotosOptions = {}): Promise<PickedPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: selectionLimit > 1,
    selectionLimit,
    // Full quality: the picker hands back the original file untouched. Compression before upload is
    // a separate step (phase P7).
    quality: 1,
  });
  return result.canceled ? [] : result.assets.map(toPickedPhoto);
}

async function takePhoto(): Promise<PickedPhoto[]> {
  // Ask first, so a refusal is a plain "not granted" result and never depends on an error code. The
  // native launch below asks again (and, on Android 9 and older, also asks for storage), which is
  // why the error handling stays.
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return [];

  try {
    // The photo is kept in the app's cache, not copied into the user's gallery.
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    return result.canceled ? [] : result.assets.map(toPickedPhoto);
  } catch (error) {
    if (isExpectedCameraError(error)) return [];
    throw error;
  }
}

/**
 * Offers a camera-or-gallery choice via a native alert, then launches the chosen source. A farmer
 * photographing a diseased leaf in the field, or a dealer photographing new stock, should not have
 * to leave the app to take the photo first. This is the one place that decides between the two, so
 * every call site gets the camera option by using this instead of the picker directly.
 *
 * Resolves to an empty array on cancel (alert dismissal, the picker's own cancel, a refused camera
 * permission), so callers do not need to special-case cancellation.
 */
export function pickPhotos({ selectionLimit = 1 }: PickPhotosOptions = {}): Promise<PickedPhoto[]> {
  return new Promise((resolve, reject) => {
    Alert.alert('Add Photo', undefined, [
      { text: 'Take Photo', onPress: () => takePhoto().then(resolve, reject) },
      {
        text: 'Choose from Gallery',
        onPress: () => pickFromLibrary({ selectionLimit }).then(resolve, reject),
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve([]) },
    ]);
  });
}
