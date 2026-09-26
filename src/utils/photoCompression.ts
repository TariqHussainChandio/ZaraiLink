import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Longest edge of an uploaded photo. A phone camera's 12 MP original is far beyond what a listing or a leaf diagnosis needs. */
export const MAX_PHOTO_EDGE = 1600;
export const PHOTO_QUALITY = 0.8;

/** The photo as it will be uploaded: a JPEG that fits in MAX_PHOTO_EDGE. */
export interface CompressedPhoto {
  uri: string;
  width: number;
  height: number;
}

/**
 * Re-encodes a photo as a JPEG no larger than MAX_PHOTO_EDGE on its longest side.
 *
 * Re-encoding is also what removes the EXIF block: the original carries the GPS position of a farm or a
 * home and the device model, and none of it should leave the phone. The manipulator writes a new file
 * from the decoded pixels only, so there is nothing to strip separately.
 *
 * The image is always re-encoded, even when it is already small, for that reason. `width` and `height`
 * come from the picker and are used to choose the edge to shrink; without them the image is only re-encoded.
 */
export async function compressPhoto(uri: string, width?: number, height?: number): Promise<CompressedPhoto> {
  const context = ImageManipulator.manipulate(uri);
  if (width && height && Math.max(width, height) > MAX_PHOTO_EDGE) {
    context.resize(width >= height ? { width: MAX_PHOTO_EDGE } : { height: MAX_PHOTO_EDGE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
