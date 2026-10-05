import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';
import { pickFromLibrary, takePhoto } from './photoPicker';

/** A file chosen for an application (A3b): a photo of a paper document, or a PDF or image already on the phone. */
export interface PickedDocument {
  uri: string;
  mimeType: string;
  fileName: string;
  /** Known for a chosen file; a photo is compressed on the way in, so its size is known only after upload. */
  sizeBytes?: number;
}

// The buckets accept these and nothing else, up to 10 MB (20261012080000_applications.sql); the app checks first only to
// answer sooner, Storage still decides.
const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

async function chooseFile(): Promise<PickedDocument | null> {
  // Copied to the app's cache, so the upload reads a file the app owns, not a provider's temporary grant.
  const result = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_TYPES, copyToCacheDirectory: true, multiple: false });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, mimeType: asset.mimeType ?? 'application/pdf', fileName: asset.name, sizeBytes: asset.size };
}

async function fromPhotos(photos: Promise<{ uri: string; mimeType?: string; fileName?: string }[]>): Promise<PickedDocument | null> {
  const photo = (await photos)[0];
  if (!photo) return null;
  return { uri: photo.uri, mimeType: photo.mimeType ?? 'image/jpeg', fileName: photo.fileName ?? `photo-${Date.now()}.jpg` };
}

/**
 * Asks where the document comes from: the camera (a paper certificate photographed on the spot), the gallery, or a file
 * (a PDF the applicant already has). Resolves to null when they back out, so callers need no special case for it.
 */
export function pickApplicationDocument(): Promise<PickedDocument | null> {
  return new Promise((resolve, reject) => {
    // Android shows at most three buttons (React Native keeps the first three), so there is no Cancel button: the
    // alert is cancelable instead, by tapping outside it or Back (A3b verification, L4).
    Alert.alert(
      'Add a document',
      undefined,
      [
        { text: 'Take photo', onPress: () => fromPhotos(takePhoto()).then(resolve, reject) },
        { text: 'Choose photo', onPress: () => fromPhotos(pickFromLibrary()).then(resolve, reject) },
        { text: 'Choose file (PDF or image)', onPress: () => chooseFile().then(resolve, reject) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}
