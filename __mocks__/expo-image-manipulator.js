// The real module re-encodes an image file natively, which does not exist under Jest. This stand-in hands back the
// same file, so screen tests that pick a photo see the picked uri arrive at the upload. What compression does (the
// resize edge, JPEG, quality) is tested in frontend/utils/photoCompression.test.ts against a recording fake.
const manipulate = uri => {
  const context = {
    resize: () => context,
    renderAsync: async () => ({ saveAsync: async () => ({ uri, width: undefined, height: undefined }) }),
  };
  return context;
};

module.exports = {
  ImageManipulator: { manipulate },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
};
