import { ImageManipulator } from 'expo-image-manipulator';
import { compressPhoto, MAX_PHOTO_EDGE, PHOTO_QUALITY } from './photoCompression';

const resize = jest.fn();
const saveAsync = jest.fn();
const renderAsync = jest.fn();

beforeEach(() => {
  resize.mockReset();
  saveAsync.mockReset().mockResolvedValue({ uri: 'file:///out.jpg', width: 1600, height: 1200 });
  renderAsync.mockReset().mockResolvedValue({ saveAsync });
  jest.spyOn(ImageManipulator, 'manipulate').mockReturnValue({ resize, renderAsync } as never);
});

afterEach(() => jest.restoreAllMocks());

describe('compressPhoto', () => {
  it('shrinks a landscape photo by its width and saves a JPEG at the set quality', async () => {
    const result = await compressPhoto('file:///in.jpg', 4000, 3000);

    expect(resize).toHaveBeenCalledWith({ width: MAX_PHOTO_EDGE });
    expect(saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: PHOTO_QUALITY });
    expect(result).toEqual({ uri: 'file:///out.jpg', width: 1600, height: 1200 });
  });

  it('shrinks a portrait photo by its height', async () => {
    await compressPhoto('file:///in.jpg', 3000, 4000);

    expect(resize).toHaveBeenCalledWith({ height: MAX_PHOTO_EDGE });
  });

  it('still re-encodes a small photo (that is what removes the location) without resizing it', async () => {
    await compressPhoto('file:///in.jpg', 800, 600);

    expect(resize).not.toHaveBeenCalled();
    expect(saveAsync).toHaveBeenCalledTimes(1);
  });

  it('re-encodes without resizing when the picker gave no dimensions', async () => {
    await compressPhoto('file:///in.jpg');

    expect(resize).not.toHaveBeenCalled();
    expect(saveAsync).toHaveBeenCalledTimes(1);
  });
});
