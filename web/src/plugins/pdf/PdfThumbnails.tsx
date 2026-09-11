import React, { useRef } from 'react';
import type { LoadedPdf } from './pdf-document';
import { PdfPage } from './PdfPage';

// How wide a thumbnail is drawn, in CSS pixels. Fixed rather than fitted: the strip is a constant
// width, and a page's aspect ratio decides its height from there.
const THUMBNAIL_WIDTH = 96;

export type PdfThumbnailsProperties = {
  document: LoadedPdf;
  current: number;
  onSelect(index: number): void;
};

// The page strip. It is available in both layouts rather than being a single-page-only page picker,
// because it is also how a reader skims a long document they are scrolling. Each thumbnail goes
// through the same page-render function the stage uses, at a small fixed scale and with no text
// layer — there is no second rendering path.
export function PdfThumbnails({ document: pdf, current, onSelect }: PdfThumbnailsProperties) {
  const stripRef = useRef<HTMLDivElement>(null);

  return (
    <div className="pdf-thumbnails" ref={stripRef}>
      {pdf.pageSizes.map((size, index) => (
        <button
          key={index}
          type="button"
          className={index === current ? 'pdf-thumbnail pdf-thumbnail-current' : 'pdf-thumbnail'}
          aria-label={`Page ${index + 1}`}
          aria-current={index === current}
          onClick={() => { onSelect(index); }}
        >
          <PdfPage
            index={index}
            size={size}
            scale={size.width > 0 ? THUMBNAIL_WIDTH / size.width : 1}
            text={false}
            root={stripRef}
            renderPage={pdf.renderPage}
          />
          <span className="pdf-thumbnail-number">{index + 1}</span>
        </button>
      ))}
    </div>
  );
}
