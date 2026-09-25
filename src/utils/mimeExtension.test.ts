import { extensionFromMimeType } from './mimeExtension';

describe('extensionFromMimeType', () => {
  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['application/pdf', 'pdf'],
  ])('maps %s to .%s', (mimeType, extension) => {
    expect(extensionFromMimeType(mimeType)).toBe(extension);
  });

  it('ignores case and parameters', () => {
    expect(extensionFromMimeType('Image/PNG; charset=binary')).toBe('png');
  });

  it('uses the fallback for a missing or unknown type, never a name the caller controls', () => {
    expect(extensionFromMimeType(undefined)).toBe('jpg');
    expect(extensionFromMimeType('application/x-evil')).toBe('jpg');
    expect(extensionFromMimeType('application/x-evil', 'bin')).toBe('bin');
  });
});
