import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronLeft, faChevronRight, faFile, faImages, faLayerGroup, faMinus, faPlus,
} from '@fortawesome/free-solid-svg-icons';
import type { PdfPayload } from '@shared/plugins/pdf/shared';
import type { TabPluginClientCapabilities } from '../api';
import { stepZoom, type PdfLayout } from './pdf-view-model';
import { PdfStage, type PdfJump } from './PdfStage';
import { PdfThumbnails } from './PdfThumbnails';
import { usePdfDocument } from './usePdfDocument';
import { usePdfKeys } from './usePdfKeys';

// A PDF tab body: the shared metadata header with the file's name, size, and location, the layout
// and page-strip toggles and the zoom controls before the host's split action, and beneath it the
// thumbnail strip and the stage.
//
// Layout, zoom, the current page, and whether the strip is showing are per tab and live in memory.
// None of it is persisted, restored by `--relaunch`, or carried into a second PDF tab — exactly as
// image zoom and markdown scroll position behave.
export function PdfTab({
  payload: pdf, capabilities,
}: { payload: PdfPayload; capabilities: TabPluginClientCapabilities }) {
  const state = usePdfDocument(capabilities.resourceUrl(pdf.url), capabilities);
  const [layout, setLayout] = useState<PdfLayout>('single');
  const [strip, setStrip] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(0);
  const [jump, setJump] = useState<PdfJump>({ page: 0, token: 0 });
  const stageRef = useRef<HTMLDivElement>(null);

  const loaded = state.status === 'ready' ? state.document : null;
  const pageCount = loaded?.pageSizes.length ?? 0;

  const goToPage = useCallback((next: number) => {
    setPage(next);
    setJump((current) => ({ page: next, token: current.token + 1 }));
  }, []);

  const handlers = useMemo(() => ({
    pageBy: (delta: number) => {
      goToPage(Math.min(Math.max(0, page + delta), Math.max(0, pageCount - 1)));
    },
    zoomBy: (steps: number) => { setZoom((current) => stepZoom(current, steps)); },
    resetZoom: () => { setZoom(1); },
  }), [goToPage, page, pageCount]);

  usePdfKeys(capabilities.active && loaded !== null, layout, stageRef, handlers);

  const toggleLayout = () => {
    setLayout((current) => (current === 'single' ? 'continuous' : 'single'));
    setJump((current) => ({ page, token: current.token + 1 }));
  };

  return (
    <div className="plugin-tab pdf-tab" data-doc-shot="pdf-view">
      <div className="plugin-meta">
        <span className="plugin-name">{pdf.name}</span>
        <span className="plugin-size">{pdf.size}</span>
        <span className="plugin-loc">{pdf.path}</span>
        {loaded && <span className="pdf-position">{page + 1} / {pageCount}</span>}
        <span className="plugin-actions">
          {loaded && (
            <>
              <button
                type="button"
                className="pdf-action"
                title={strip ? 'Hide pages' : 'Show pages'}
                aria-label={strip ? 'Hide pages' : 'Show pages'}
                onClick={() => { setStrip(!strip); }}
              >
                <FontAwesomeIcon icon={faImages} />
              </button>
              <button
                type="button"
                className="pdf-action"
                title={layout === 'single' ? 'Continuous scroll' : 'Single page'}
                aria-label={layout === 'single' ? 'Continuous scroll' : 'Single page'}
                onClick={toggleLayout}
              >
                <FontAwesomeIcon icon={layout === 'single' ? faLayerGroup : faFile} />
              </button>
              <button
                type="button"
                className="pdf-action"
                title="Zoom out"
                aria-label="Zoom out"
                onClick={() => { handlers.zoomBy(-1); }}
              >
                <FontAwesomeIcon icon={faMinus} />
              </button>
              <button
                type="button"
                className="pdf-action"
                title="Zoom in"
                aria-label="Zoom in"
                onClick={() => { handlers.zoomBy(1); }}
              >
                <FontAwesomeIcon icon={faPlus} />
              </button>
              {layout === 'single' && (
                <>
                  <button
                    type="button"
                    className="pdf-action"
                    title="Previous page"
                    aria-label="Previous page"
                    disabled={page === 0}
                    onClick={() => { handlers.pageBy(-1); }}
                  >
                    <FontAwesomeIcon icon={faChevronLeft} />
                  </button>
                  <button
                    type="button"
                    className="pdf-action"
                    title="Next page"
                    aria-label="Next page"
                    disabled={page >= pageCount - 1}
                    onClick={() => { handlers.pageBy(1); }}
                  >
                    <FontAwesomeIcon icon={faChevronRight} />
                  </button>
                </>
              )}
            </>
          )}
          {capabilities.splitAction}
        </span>
      </div>
      <div className="pdf-body">
        {loaded && strip && (
          <PdfThumbnails document={loaded} current={page} onSelect={goToPage} />
        )}
        {state.status === 'failed'
          ? <div className="pdf-failed">Failed to load {pdf.name}</div>
          : loaded && (
            <PdfStage
              document={loaded}
              layout={layout}
              zoom={zoom}
              page={page}
              jump={jump}
              onVisiblePage={setPage}
              onRenderFailure={state.onRenderFailure}
              stageRef={stageRef}
            />
          )}
      </div>
    </div>
  );
}
