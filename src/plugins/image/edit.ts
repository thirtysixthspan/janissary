import path from 'node:path';
import { replaceFileAtomically } from '../files.js';

export function saveImageEdit(imagePath: string, dataUrl: string): string {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) throw new Error('image edit expected a PNG data URL');
  replaceFileAtomically(imagePath, Buffer.from(dataUrl.slice(prefix.length), 'base64'));
  return path.basename(imagePath);
}
