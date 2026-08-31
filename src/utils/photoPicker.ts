import { Alert } from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';

export interface PickPhotosOptions {
  selectionLimit?: number;
}

/**
 * Offers a camera-or-gallery choice via a native alert, then launches the chosen source. Every
 * picker call site in this app used `launchImageLibrary` only — a farmer photographing a
 * diseased leaf in the field, or a dealer photographing new stock, had to leave the app to take
 * the photo first and then attach it. This is the one place that decides between the two now, so
 * every call site gets the camera option by switching to this instead of calling
 * `launchImageLibrary` directly.
 *
 * Resolves to an empty array on cancel (either alert dismissal or the picker's own cancel), same
 * as `result.assets` being undefined from the underlying picker — callers don't need to special-
 * case cancellation.
 */
export function pickPhotos({ selectionLimit = 1 }: PickPhotosOptions = {}): Promise<Asset[]> {
  return new Promise(resolve => {
    Alert.alert('Add Photo', undefined, [
      {
        text: 'Take Photo',
        onPress: async () => {
          const result = await launchCamera({ mediaType: 'photo', saveToPhotos: true });
          resolve(result.assets ?? []);
        },
      },
      {
        text: 'Choose from Gallery',
        onPress: async () => {
          const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit });
          resolve(result.assets ?? []);
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve([]) },
    ]);
  });
}
