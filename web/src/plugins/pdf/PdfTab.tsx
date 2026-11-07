import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronLeft, faChevronRight, faFile, faImages, faLayerGroup, faMinus, faPlus,
} from '@fortawesome/free-solid-svg-icons';
import type { PdfPayload } from '@shared/plugins/pdf/shared';
import { LineFind, usePluginChordClaims, type TabPluginClientCapabilities } from '../api';
import { stepZoom, type PdfLayout } from './pdf-view-model';
import { PdfStage, type PdfJump } from './PdfStage';
import { PdfThumbnails } from './PdfThumbnails';
import { usePdfDocument } from './usePdfDocument';
import { usePdfFind } from './usePdfFind';
import { usePdfFindMarks } from './usePdfFindMarks';
import { usePdfKeys } from './usePdfKeys';

// A PDF tab body: the shared metadata header with the file's name, size, and location, the layout
// and page-strip toggles and the zoom controls before the host's split action, and beneath it the
// thumbnail strip and the stage.
//
// Layout, zoom, the current page, and whether the strip is showing are per tab and live in memory.
// None of it is persisted, restored on launch, or carried into a second PDF tab — exactly as
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
  const [textLayerVersion, setTextLayerVersion] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  const loaded = state.status === 'ready' ? state.document : null;
  const pageCount = loaded?.pageSizes.length ?? 0;

  const goToPage = useCallback((next: number, offset?: number) => {
    setPage(next);
    setJump((current) => (offset === undefined
      ? { page: next, token: current.token + 1 }
      : { page: next, offset, token: current.token + 1 }));
  }, []);

  const revealLine = useCallback((next: number, top: number) => { goToPage(next, top); }, [goToPage]);
  const onTextLayer = useCallback(() => {
    setTextLayerVersion((current) => current + 1);
  }, []);
  const findInputRef = useRef<HTMLInputElement>(null);
  const find = usePdfFind({
    active: capabilities.active, pdf: loaded, revealLine, inputRef: findInputRef,
  });
  usePdfFindMarks({
    open: find.findOpen,
    query: find.query,
    current: find.current,
    stageRef,
    textLayerVersion,
  });

  const handlers = useMemo(() => ({
    pageBy: (delta: number) => {
      goToPage(Math.min(Math.max(0, page + delta), Math.max(0, pageCount - 1)));
    },
    zoomBy: (steps: number) => { setZoom((current) => stepZoom(current, steps)); },
    resetZoom: () => { setZoom(1); },
  }), [goToPage, page, pageCount]);

  usePdfKeys(
    capabilities.active && loaded !== null,
    layout,
    stageRef,
    handlers,
    find.findOpen,
    find.close,
  );

  usePluginChordClaims('pdf', capabilities.label ?? 'pdf', capabilities.claimedChords ?? [], capabilities.active, () => {
    if (loaded) find.open();
  });

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
              onTextLayer={onTextLayer}
              stageRef={stageRef}
            />
          )}
      </div>
      {state.status === 'ready' && find.findOpen && (
        <LineFind
          placeholder="Search document"
          query={find.query}
          onChangeQuery={find.setQuery}
          results={find.results}
          selected={find.selected}
          onChangeSelected={find.select}
          onClose={find.close}
          rowLabel={(result) => {
            const line = find.lines?.[result.index];
            return line ? line.page + 1 : null;
          }}
          status={find.reading ? 'Reading pages…' : undefined}
          inputRef={findInputRef}
        />
      )}
    </div>
  );
}
