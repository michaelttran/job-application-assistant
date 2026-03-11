// popup.js — Handles all popup UI interactions

const PROFILE_FIELDS = ['fullName', 'email', 'phone', 'location', 'linkedin', 'github', 'portfolio', 'currentTitle', 'yearsExp', 'resumeSummary', 'careerGoals', 'diversityGender', 'diversityRace', 'diversityVeteran', 'diversityDisability', 'diversityHispanic', 'diversityTransgender', 'diversitySexualOrientation', 'diversityCommunities', 'diversityAge'];
const SETTINGS_FIELDS = ['apiKey', 'responseStyle', 'answerLength'];

// ── Nav tabs ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.panel}`).classList.add('active');
  });
});

// ── Load saved data ───────────────────────────────────────────────────────────
chrome.storage.local.get([...PROFILE_FIELDS, ...SETTINGS_FIELDS], (data) => {
  PROFILE_FIELDS.forEach(f => { if (data[f]) document.getElementById(f).value = data[f]; });
  SETTINGS_FIELDS.forEach(f => { if (data[f]) document.getElementById(f).value = data[f]; });
});

// ── Save profile ──────────────────────────────────────────────────────────────
document.getElementById('saveProfile').addEventListener('click', () => {
  const data = {};
  PROFILE_FIELDS.forEach(f => { data[f] = document.getElementById(f).value.trim(); });
  chrome.storage.local.set(data, () => showBadge('profileBadge'));
});

// ── Save settings ─────────────────────────────────────────────────────────────
document.getElementById('saveSettings').addEventListener('click', () => {
  const data = {};
  SETTINGS_FIELDS.forEach(f => { data[f] = document.getElementById(f).value.trim(); });
  chrome.storage.local.set(data, () => {
    showBadge('profileBadge');
    showStatus('Settings saved!', 'active');
  });
});

// ── Export profile to JSON file ───────────────────────────────────────────────
document.getElementById('exportProfile').addEventListener('click', () => {
  chrome.storage.local.get(PROFILE_FIELDS, (data) => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'job-assistant-profile.json';
    a.click();
    URL.revokeObjectURL(url);
  });
});

// ── Import profile from JSON file ─────────────────────────────────────────────
document.getElementById('importProfile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      // Only import known profile fields — ignore anything else in the file
      const filtered = {};
      PROFILE_FIELDS.forEach(f => { if (data[f] !== undefined) filtered[f] = data[f]; });
      chrome.storage.local.set(filtered, () => {
        // Populate all fields in the UI
        PROFILE_FIELDS.forEach(f => {
          const el = document.getElementById(f);
          if (el && filtered[f] !== undefined) el.value = filtered[f];
        });
        showBadge('profileBadge');
        showStatus('Profile imported!', 'active');
      });
    } catch {
      showStatus('Invalid JSON file', 'warning');
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // reset so same file can be re-imported
});


document.getElementById('toggleKey').addEventListener('click', () => {
  const input = document.getElementById('apiKey');
  const btn = document.getElementById('toggleKey');
  if (input.type === 'password') { input.type = 'text'; btn.textContent = 'Hide'; }
  else { input.type = 'password'; btn.textContent = 'Show'; }
});

// ── Clear all data ────────────────────────────────────────────────────────────
document.getElementById('clearAll').addEventListener('click', () => {
  if (confirm('Clear all saved data including your profile and API key?')) {
    chrome.storage.local.clear(() => {
      [...PROFILE_FIELDS, ...SETTINGS_FIELDS].forEach(f => { document.getElementById(f).value = ''; });
      showStatus('All data cleared.', 'warning');
    });
  }
});

// ── Open side panel ───────────────────────────────────────────────────────────
document.getElementById('openSidePanel').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.sidePanel.open({ tabId: tabs[0].id });
    window.close();
  });
});

// ── Auto-fill form ────────────────────────────────────────────────────────────
document.getElementById('autoFillBtn').addEventListener('click', () => {
  sendToContent({ action: 'autoFill' }, (res) => {
    showStatus(res?.message || 'Filled fields!', 'active');
  });
});

// ── Detect questions ──────────────────────────────────────────────────────────
document.getElementById('detectQuestionsBtn').addEventListener('click', () => {
  sendToContent({ action: 'detectQuestions' }, (res) => {
    const count = res?.questions?.length || 0;
    showStatus(`Found ${count} open-ended question${count !== 1 ? 's' : ''}`, count > 0 ? 'active' : 'warning');
    if (count > 0) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.sidePanel.open({ tabId: tabs[0].id });
        window.close();
      });
    }
  });
});

// ── Highlight fields ──────────────────────────────────────────────────────────
document.getElementById('highlightBtn').addEventListener('click', () => {
  sendToContent({ action: 'highlight' }, () => showStatus('Fields highlighted', 'active'));
});

document.getElementById('clearHighlightBtn').addEventListener('click', () => {
  sendToContent({ action: 'clearHighlight' }, () => showStatus('Highlights cleared', 'warning'));
});

// ── Status check on load ──────────────────────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url || '';
  const supported = ['linkedin.com', 'myworkdayjobs.com', 'workday.com', 'greenhouse.io', 'lever.co', 'jobs.lever.co', 'ashbyhq.com'];
  const hasEmbedParam = url.includes('gh_jid=') || url.includes('ashby_jid=');
  const isSupported = supported.some(s => url.includes(s)) || hasEmbedParam;
  showStatus(
    isSupported ? 'Supported job site detected' : 'Navigate to a job application',
    isSupported ? 'active' : ''
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────
// Sends a message to ALL frames in the active tab (top-level + all iframes).
// This is required for embedded Greenhouse/Ashby forms which live in a child frame.
// Calls cb with the first non-empty response received.
function sendToContent(msg, cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;

    // Get all frames in the tab, then message each one
    chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
      if (!frames || frames.length === 0) {
        // Fallback: just send to frame 0
        chrome.tabs.sendMessage(tabId, msg, (res) => { if (cb) cb(res); });
        return;
      }

      let responded = false;
      let pending = frames.length;

      frames.forEach(({ frameId }) => {
        chrome.tabs.sendMessage(tabId, msg, { frameId }, (res) => {
          pending--;
          // Suppress "no receiver" errors for frames without content script
          if (chrome.runtime.lastError) return;
          // Use first meaningful response (prefer frames that did actual work)
          if (!responded && res && (res.message || res.questions || res.ok || res.success)) {
            responded = true;
            if (cb) cb(res);
          }
          // If all frames responded and none had useful data, still call cb
          if (pending === 0 && !responded && cb) cb(res);
        });
      });
    });
  });
}

function showStatus(text, state) {
  document.getElementById('statusText').textContent = text;
  const dot = document.getElementById('statusDot');
  dot.className = 'status-dot';
  if (state) dot.classList.add(state);
}

function showBadge(id) {
  const badge = document.getElementById(id);
  badge.classList.add('show');
  setTimeout(() => badge.classList.remove('show'), 2000);
}
