// The image tab's two bodies, measured the way a user reads them: the viewer's stage, zoom badge and
// pan offsets, and the editor's canvas, toolbar and crop rectangle. Scoped to the visible tab body —
// see `inspect.mjs` for why that is not optional.
//
// One evaluate reads the whole active tab body and the readers below pick fields out of it: a
// page-side function cannot close over anything in this module, so asking twice would mean writing
// the same metadata block twice.
//
// `canvasSignature` is the part worth keeping for any canvas-based view: an edit's effect is a
// question about pixels, and a hash plus the four corner pixels answers "did this operation actually
// land, and in which direction" without a screenshot and an eye.

/* global document, getComputedStyle */

export const TAB_BODY = '.tab-body:visible';

export async function activeTabBody(page) {
  return page.evaluate(() => {
    const scope = [...document.querySelectorAll('.tab-body')]
      .find((body) => body.getClientRects().length > 0) ?? document;
    const stage = scope.querySelector('.plugin-stage');
    const image = stage?.querySelector(':scope > img');
    const canvas = scope.querySelector('.image-edit-canvas');
    const source = scope.querySelector('.image-edit-source');
    const cropRect = scope.querySelector('.image-crop-rect');
    const stageBox = stage?.getBoundingClientRect();
    const stageStyle = stage ? getComputedStyle(stage) : undefined;
    const imageBox = image?.getBoundingClientRect();
    const buttons = (selector) => [...scope.querySelectorAll(selector)].map((button) => ({
      text: button.textContent.trim(),
      title: button.getAttribute('title'),
      ariaLabel: button.getAttribute('aria-label'),
      disabled: button.disabled,
      active: button.classList.contains('active'),
    }));
    return {
      metadata: {
        name: scope.querySelector('.plugin-name')?.textContent ?? null,
        size: scope.querySelector('.plugin-size')?.textContent ?? null,
        location: scope.querySelector('.plugin-loc')?.textContent ?? null,
        dimensions: scope.querySelector('.image-dimensions')?.textContent ?? null,
        saved: scope.querySelector('.image-edit-saved')?.textContent ?? null,
        actions: buttons('.plugin-actions button'),
      },
      hasCommandBar: scope.querySelectorAll('.command-area').length,
      hasTranscript: scope.querySelectorAll('.transcript').length,
      viewer: stage ? {
        stage: { width: Math.round(stageBox.width), height: Math.round(stageBox.height) },
        // `offsetWidth` against `clientWidth` is the scrollbar's own measure, so a promise that none
        // is shown is checked rather than read off the stylesheet.
        scrollbar: {
          width: stage.offsetWidth - stage.clientWidth,
          height: stage.offsetHeight - stage.clientHeight,
          overflowX: stageStyle.overflowX,
          overflowY: stageStyle.overflowY,
        },
        offset: { left: stage.scrollLeft, top: stage.scrollTop },
        scrollableBy: { x: stage.scrollWidth - stage.clientWidth, y: stage.scrollHeight - stage.clientHeight },
        zoomBadge: scope.querySelector('.image-zoom-badge')?.textContent ?? null,
        image: image ? {
          orientation: image.className,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          decoded: image.complete && image.naturalWidth > 0,
          width: Math.round(imageBox.width),
          height: Math.round(imageBox.height),
          inlineWidth: image.style.width,
          inlineHeight: image.style.height,
          source: image.getAttribute('src'),
        } : null,
      } : null,
      editor: {
        mounted: Boolean(canvas),
        canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
        source: source ? {
          display: getComputedStyle(source).display,
          naturalWidth: source.naturalWidth,
          naturalHeight: source.naturalHeight,
          decoded: source.complete && source.naturalWidth > 0,
        } : null,
        visibleViewerImages: scope.querySelectorAll(':scope > .plugin-stage > img').length,
        toolbar: buttons('.image-edit-toolbar button'),
        cropArmed: Boolean(scope.querySelector('[data-testid="crop-overlay"]')),
        crop: cropRect ? {
          readout: scope.querySelector('.image-crop-readout')?.textContent ?? null,
          box: cropRect.getAttribute('style'),
        } : null,
      },
    };
  });
}

export async function viewer(page) {
  const body = await activeTabBody(page);
  return { ...body.viewer, metadata: body.metadata, hasCommandBar: body.hasCommandBar, hasTranscript: body.hasTranscript };
}

export async function editor(page) {
  const body = await activeTabBody(page);
  return { ...body.editor, metadata: body.metadata };
}

// A fingerprint of what is on the canvas: its size, a hash of every pixel, and the four corner
// pixels. Two routes to the same picture produce the same fingerprint; a rotation, a flip and a crop
// each move the corners somewhere different.
export async function canvasSignature(page) {
  return page.evaluate(() => {
    const scope = [...document.querySelectorAll('.tab-body')]
      .find((body) => body.getClientRects().length > 0) ?? document;
    const canvas = scope.querySelector('.image-edit-canvas');
    if (!canvas) return null;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let hash = 0;
    for (let index = 0; index < data.length; index += 4) {
      hash = (Math.imul(hash, 31) + data[index] + 7 * data[index + 1] + 13 * data[index + 2]) % 2_147_483_647;
    }
    const corner = (x, y) => [...context.getImageData(x, y, 1, 1).data].join(',');
    const inset = 1;
    return {
      width: canvas.width,
      height: canvas.height,
      hash,
      corners: {
        topLeft: corner(inset, inset),
        topRight: corner(canvas.width - 1 - inset, inset),
        bottomLeft: corner(inset, canvas.height - 1 - inset),
        bottomRight: corner(canvas.width - 1 - inset, canvas.height - 1 - inset),
      },
    };
  });
}
