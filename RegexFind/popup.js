let debounceTimer = null;
let caseInsensitive = true;

function sendToActiveTab(message) {
  return browser.tabs.query({ active: true, currentWindow: true })
    .then(tabs => {
      if (!tabs[0]) throw new Error('No active tab');
      return browser.tabs.sendMessage(tabs[0].id, message);
    });
}

function onSearch(pattern, flags) {
  sendToActiveTab({ action: 'search', pattern, flags })
    .then(state => {
      if (state) {
        updateMatchCount(state.currentIndex + 1, state.matchCount);
        if (state.error) showError(state.error);
      }
    })
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
  const el = document.getElementById('error-msg');
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError() {
  const el = document.getElementById('error-msg');
  el.textContent = '';
  el.classList.add('hidden');
}

function showCannotSearch() {
  const input = document.getElementById('regex-input');
  input.disabled = true;
  input.placeholder = 'Cannot search on this page';
  document.getElementById('match-count').textContent = '\u2014';
}

function validateAndSearch(value) {
  const input = document.getElementById('regex-input');

  if (!value) {
    input.classList.remove('error');
    hideError();
    onClear();
    return;
  }

  const flags = 'g' + (caseInsensitive ? 'i' : '');
  try {
    new RegExp(value, flags);
    input.classList.remove('error');
    hideError();
    onSearch(value, flags);
  } catch (e) {
    input.classList.add('error');
    showError(e.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('regex-input');
  const caseToggle = document.getElementById('case-toggle');

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
    debounceTimer = setTimeout(() => validateAndSearch(input.value), 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.repeat) {
      e.preventDefault();
      onNavigate(e.shiftKey ? 'prev' : 'next');
    } else if (e.key === 'Escape') {
      input.value = '';
      input.classList.remove('error');
      hideError();
      onClear();
    }
  });

  caseToggle.addEventListener('click', () => {
    caseInsensitive = !caseInsensitive;
    caseToggle.classList.toggle('toggle-active');
    if (input.value) validateAndSearch(input.value);
  });

  document.getElementById('next-btn').addEventListener('click', () => onNavigate('next'));
  document.getElementById('prev-btn').addEventListener('click', () => onNavigate('prev'));
});

browser.runtime.onMessage.addListener((message) => {
  if (message.action === 'stateUpdate') {
    updateMatchCount(message.currentIndex + 1, message.matchCount);
    if (message.error) showError(message.error);
  }
});
