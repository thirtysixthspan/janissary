import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { Connect } from 'vite';

const PDFJS_ASSET_ROUTE = /^\/pdfjs\/(cmaps|standard_fonts)\/([\w-][\w.-]*)$/u;

function readAsset(packageRoot: string, url: string) {
  const route = PDFJS_ASSET_ROUTE.exec(url);
  if (!route) return;
  try {
    const candidate = realpathSync(path.resolve(packageRoot, route[1], route[2]));
    const relative = path.relative(packageRoot, candidate);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
    return {
      content: readFileSync(candidate),
      contentType: path.extname(candidate) === '.ttf' ? 'font/ttf' : 'application/octet-stream',
    };
  } catch {
    return;
  }
}

export function pdfjsAssetMiddleware(root: string): Connect.NextHandleFunction {
  const packageRoot = realpathSync(root);
  return (request, response, next) => {
    const asset = readAsset(packageRoot, request.url ?? '');
    if (!asset) { next(); return; }
    response.setHeader('Content-Type', asset.contentType);
    response.end(asset.content);
  };
}
