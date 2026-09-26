import { open } from 'node:fs/promises';

const PNG_TYPE = 'image/png';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function startsWithPngSignature(filePath: string): Promise<boolean> {
  const handle = await open(filePath, 'r');
  try {
    const { bytesRead, buffer } = await handle.read(Buffer.alloc(PNG_SIGNATURE.length), 0, PNG_SIGNATURE.length, 0);
    return bytesRead === PNG_SIGNATURE.length && buffer.equals(PNG_SIGNATURE);
  } finally {
    await handle.close();
  }
}

// The type an opened file is served as. The extension decides, with one exception: the image editor
// saves every edit as a PNG over the file it opened, so an image whose bytes are a PNG is served as
// one whatever its extension says. A browser shrugs off a mislabelled raster, but refuses PNG bytes
// labelled `image/svg+xml` outright. Only images are sniffed and only toward PNG, so this can never
// relabel a non-image or promote bytes to a scriptable type. A file that cannot be read keeps its
// extension's type and leaves the error to the route that serves it.
export async function servedContentType(filePath: string, extensionType: string): Promise<string> {
  if (!extensionType.startsWith('image/') || extensionType === PNG_TYPE) return extensionType;
  try {
    return await startsWithPngSignature(filePath) ? PNG_TYPE : extensionType;
  } catch {
    return extensionType;
  }
}
