if (typeof CSS === 'undefined' || !CSS.highlights) {
  console.error('CSS Custom Highlight API not supported');
}

const MAX_RESULTS = 500;
const EXCLUDE_TAGS = /^(script|style|svg|audio|canvas|figure|video|select|input|textarea|noscript|template)$/i;
const HIGHLIGHT_NAME = 'regex-find-matches';
const CURRENT_HIGHLIGHT_NAME = 'regex-find-current';
const BACKTRACK_TIMEOUT_MS = 1000;

let searchState = {
  pattern: '',
  flags: 'gi',
  matchCount: 0,
  currentIndex: -1,
  error: null
};
let matchRanges = [];

// "Safari-like" visibility: only include text that occupies visible pixels.
// Layer 1: tag denylist  |  Layer 2: checkVisibility()  |  Layer 3: getClientRects()
function isNodeExcluded(node) {
  const el = node.parentElement;
  if (!el) return true;

  // Layer 1: tag denylist (fast, no style computation)
  let ancestor = el;
  while (ancestor) {
    if (EXCLUDE_TAGS.test(ancestor.tagName)) return true;
    if (ancestor.getAttribute('contenteditable') === 'true') return true;
    ancestor = ancestor.parentElement;
  }

  // Layer 2: native visibility check (walks full ancestor chain)
  if (el.checkVisibility) {
    if (!el.checkVisibility({
      opacityProperty: true,
      visibilityProperty: true
    })) return true;
  } else {
    // Fallback for older Safari without checkVisibility
    const style = getComputedStyle(el);
    if (style.display === 'none') return true;
    if (style.visibility === 'hidden') return true;
    if (style.opacity === '0') return true;
  }

  return false;
}

// Layer 3: verify Range has non-zero screen area (catches transform:scale(0), font-size:0, etc.)
function rangeIsVisible(range) {
  const rects = range.getClientRects();
  if (rects.length === 0) return false;

  // Check that at least one rect has non-zero area
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.width > 0 && r.height > 0) return true;
  }
  return false;
}

function collectTextNodes(root) {
  const textNodes = [];
  const checkedParents = new Map();

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let current = walker.nextNode();

  while (current) {
    const parent = current.parentElement;
    if (parent) {
      let excluded = checkedParents.get(parent);
      if (excluded === undefined) {
        excluded = isNodeExcluded(current);
        checkedParents.set(parent, excluded);
      }
      if (!excluded && current.textContent.length > 0) {
        textNodes.push(current);
      }
    }
    current = walker.nextNode();
  }

  return textNodes;
}

function findMatches(textNodes, regex, maxResults) {
  const ranges = [];

  for (const textNode of textNodes) {
    if (ranges.length >= maxResults) break;

    regex.lastIndex = 0;
    const nodeStart = performance.now();
    let match;

    while ((match = regex.exec(textNode.textContent)) !== null) {
      // Prevent infinite loop on zero-length matches (e.g. regex /a*/ matching "")
      if (match[0].length === 0) {
        regex.lastIndex++;
        continue;
      }

      // Catastrophic backtracking guard: abandon node after 1s
      if (performance.now() - nodeStart > BACKTRACK_TIMEOUT_MS) {
        searchState.error = 'Regex too slow on some content — results may be incomplete';
        break;
      }

      const range = document.createRange();
      range.setStart(textNode, match.index);
      range.setEnd(textNode, match.index + match[0].length);

      if (!rangeIsVisible(range)) continue;

      ranges.push(range);

      if (ranges.length >= maxResults) break;
    }
  }

  return ranges;
}

function applyHighlights(ranges) {
  if (ranges.length === 0) return;
  const highlight = new Highlight(...ranges);
  CSS.highlights.set(HIGHLIGHT_NAME, highlight);
}

function highlightCurrent(index) {
  if (index < 0 || index >= matchRanges.length) return;
  CSS.highlights.set(CURRENT_HIGHLIGHT_NAME, new Highlight(matchRanges[index]));
}

function scrollToMatch(index) {
  if (index < 0 || index >= matchRanges.length) return;
  const rect = matchRanges[index].getBoundingClientRect();
  window.scrollTo({
    top: window.scrollY + rect.top - window.innerHeight / 2,
    behavior: 'smooth'
  });
}

function navigateTo(index) {
  searchState.currentIndex = index;
  highlightCurrent(index);
  scrollToMatch(index);
}

function selectNext() {
  if (matchRanges.length === 0) return;
  navigateTo((searchState.currentIndex + 1) % matchRanges.length);
}

function selectPrev() {
  if (matchRanges.length === 0) return;
  navigateTo((searchState.currentIndex - 1 + matchRanges.length) % matchRanges.length);
}

function clearHighlights() {
  CSS.highlights.delete(HIGHLIGHT_NAME);
  CSS.highlights.delete(CURRENT_HIGHLIGHT_NAME);
  matchRanges = [];
  searchState.pattern = '';
  searchState.matchCount = 0;
  searchState.currentIndex = -1;
  searchState.error = null;
}

function performSearch(pattern, flags) {
  clearHighlights();

  if (!pattern) return searchState;

  let regex;
  try {
    regex = new RegExp(pattern, flags);
  } catch (e) {
    searchState.pattern = pattern;
    searchState.flags = flags;
    searchState.error = e.message;
    return searchState;
  }

  const textNodes = collectTextNodes(document.body);
  matchRanges = findMatches(textNodes, regex, MAX_RESULTS);
  applyHighlights(matchRanges);

  searchState.pattern = pattern;
  searchState.flags = flags;
  searchState.matchCount = matchRanges.length;

  if (matchRanges.length > 0) {
    searchState.currentIndex = 0;
    highlightCurrent(0);
    scrollToMatch(0);
  }

  return searchState;
}

function respondWithState(sendResponse, broadcast = true) {
  sendResponse({ ...searchState });
  if (broadcast) {
    browser.runtime.sendMessage({ action: 'stateUpdate', ...searchState }).catch(() => {});
  }
}

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) return false;

  switch (request.action) {
    case 'search':
      performSearch(request.pattern, request.flags);
      respondWithState(sendResponse);
      break;
    case 'selectNext':
      selectNext();
      respondWithState(sendResponse);
      break;
    case 'selectPrev':
      selectPrev();
      respondWithState(sendResponse);
      break;
    case 'clear':
      clearHighlights();
      respondWithState(sendResponse, false);
      break;
    case 'getState':
      respondWithState(sendResponse, false);
      break;
    default:
      return false;
  }
  return true;
});
