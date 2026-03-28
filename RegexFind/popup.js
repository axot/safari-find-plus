let debounceTimer = null;
let caseInsensitive = true; // default: case-insensitive ON
let currentPattern = '';

function sendToActiveTab(message) {
  return browser.tabs.query({ active: true, currentWindow: true })
    .then(tabs => {
      if (!tabs[0]) throw new Error('No active tab');
      return browser.tabs.sendMessage(tabs[0].id, message);
    });
}

function onSearch(pattern, flags) {
  sendToActiveTab({ action: 'search', pattern, flags })
    .catch(() => showCannotSearch());
}

function onNavigate(direction) {
  sendToActiveTab({ action: direction === 'next' ? 'selectNext' : 'selectPrev' })
    .then(state => {
      if (state) updateMatchCount(state.currentIndex + 1, state.matchCount);
    })
    .catch(() => {});
}

function onClear() {
  sendToActiveTab({ action: 'clear' }).catch(() => {});
  updateMatchCount(0, 0);
}

function updateMatchCount(current, total) {
  document.getElementById('match-count').textContent = `${current} of ${total}`;
}

function showError(message) {
  const errorEl = document.getElementById('error-msg');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function showCannotSearch() {
  const input = document.getElementById('regex-input');
  input.disabled = true;
  input.placeholder = 'Cannot search on this page';
  document.getElementById('match-count').textContent = '\u2014';
}

function buildFlags() {
  return 'g' + (caseInsensitive ? 'i' : '');
}

function hideError() {
  const errorEl = document.getElementById('error-msg');
  errorEl.textContent = '';
  errorEl.classList.add('hidden');
}

function validateAndSearch(value) {
  if (!value) {
    currentPattern = '';
    hideError();
    const input = document.getElementById('regex-input');
    input.classList.remove('error');
    onClear();
    return;
  }

  const flags = buildFlags();

  try {
    new RegExp(value, flags);
    currentPattern = value;
    const input = document.getElementById('regex-input');
    input.classList.remove('error');
    hideError();
    onSearch(value, flags);
  } catch (e) {
    currentPattern = '';
    const input = document.getElementById('regex-input');
    input.classList.add('error');
    showError(e.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('regex-input');
  const caseToggle = document.getElementById('case-toggle');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  input.focus();

  sendToActiveTab({ action: 'getState' })
    .then(state => {
      if (state && state.pattern) {
        input.value = state.pattern;
        const hasI = state.flags && state.flags.includes('i');
        if (hasI !== caseInsensitive) {
          caseInsensitive = hasI;
          caseToggle.classList.toggle('toggle-active', caseInsensitive);
        }
        if (state.matchCount > 0) {
          updateMatchCount(state.currentIndex + 1, state.matchCount);
        }
        if (state.error) {
          showError(state.error);
        }
      }
    })
    .catch(() => showCannotSearch());

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      validateAndSearch(input.value);
    }, 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.repeat) {
      e.preventDefault();
      if (e.shiftKey) {
        onNavigate('prev');
      } else {
        onNavigate('next');
      }
    } else if (e.key === 'Escape') {
      input.value = '';
      currentPattern = '';
      hideError();
      input.classList.remove('error');
      onClear();
    }
  });

  caseToggle.addEventListener('click', () => {
    caseInsensitive = !caseInsensitive;
    caseToggle.classList.toggle('toggle-active');
    if (input.value) {
      validateAndSearch(input.value);
    }
  });

  nextBtn.addEventListener('click', () => {
    onNavigate('next');
  });

  prevBtn.addEventListener('click', () => {
    onNavigate('prev');
  });
});

browser.runtime.onMessage.addListener((message) => {
  if (message.action === 'stateUpdate') {
    updateMatchCount(message.currentIndex + 1, message.matchCount);
    if (message.error) showError(message.error);
  }
});
