// Relays the text currently visible in this frame's viewport to the Janissary app's top window, so
// a monitor watching a page tab can see what the user is actually looking at right now. Runs in
// every frame (manifest `all_frames: true`), but only ever acts inside an embedded page tab's
// iframe — the app's own top-level window is never a nested frame of itself, so it is a no-op there.
(function () {
  if (window.top === window.self) return;

  var CAPTURE_DEBOUNCE_MS = 500;
  var SOURCE = 'janissary-page-content';
  var timer = null;

  function isVisible(el) {
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  // Walk the live DOM, collecting the direct text of elements that are both viewport-intersecting
  // and not hidden by CSS, joined in document order. Off-screen and hidden content is skipped.
  function collectVisibleText(root) {
    var parts = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (node) {
        var tag = node.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        return isVisible(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    var node = walker.nextNode();
    while (node) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var child = node.childNodes[i];
        if (child.nodeType === Node.TEXT_NODE) {
          var text = child.textContent.trim();
          if (text) parts.push(text);
        }
      }
      node = walker.nextNode();
    }
    return parts.join('\n');
  }

  function capture() {
    if (!document.body) return;
    var text = document.title + '\n\n' + collectVisibleText(document.body);
    window.top.postMessage({ source: SOURCE, url: window.location.href, text: text }, '*');
  }

  function scheduleCapture() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(capture, CAPTURE_DEBOUNCE_MS);
  }

  scheduleCapture();
  new MutationObserver(scheduleCapture).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
  });
  window.addEventListener('scroll', scheduleCapture, { passive: true, capture: true });
})();
