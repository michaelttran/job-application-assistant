// sidepanel.js — AI-powered Q&A panel

let profile = {};
let settings = {};
let questions = [];

// ── Init ──────────────────────────────────────────────────────────────────────
chrome.storage.local.get(null, (data) => {
  profile = data;
  settings = data;
});

chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) {
    profile[key] = newValue;
    settings[key] = newValue;
  }
});

// ── Auto-detect company/role from page ───────────────────────────────────────
sendToContent({ action: 'getPageInfo' }, (info) => {
  if (info?.company) document.getElementById('jobCompany').value = info.company;
  if (info?.title) document.getElementById('jobTitle').value = info.title;
});

// ── Scan page for questions ───────────────────────────────────────────────────
document.getElementById('scanBtn').addEventListener('click', scanPage);
document.getElementById('scanPageBtn').addEventListener('click', scanPage);

function scanPage() {
  sendToContent({ action: 'detectQuestions' }, (res) => {
    const qs = res?.questions || [];
    if (qs.length === 0) {
      showToast('No open-ended questions detected on this page', 'error');
      return;
    }
    showToast(`Found ${qs.length} question${qs.length !== 1 ? 's' : ''}`);
    qs.forEach(q => addQuestion(q.text, q.type, q.fieldId));
  });
}

// ── Custom question ───────────────────────────────────────────────────────────
document.getElementById('addCustomQ').addEventListener('click', () => {
  const input = document.getElementById('customQuestion');
  const text = input.value.trim();
  if (!text) return;
  addQuestion(text, 'custom', null);
  input.value = '';
  // Auto-generate for custom questions
  const cards = document.querySelectorAll('.question-card');
  const lastCard = cards[cards.length - 1];
  if (lastCard) {
    const genBtn = lastCard.querySelector('.q-btn-generate');
    if (genBtn) genBtn.click();
  }
});

document.getElementById('customQuestion').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('addCustomQ').click();
});

// ── Auto-fill form fields ─────────────────────────────────────────────────────
document.getElementById('autoFillBtn').addEventListener('click', () => {
  sendToContent({ action: 'autoFill' }, (res) => {
    showToast(res?.message || 'Form fields filled!');
  });
});

// ── Add a question card ───────────────────────────────────────────────────────
function addQuestion(text, type = 'custom', fieldId = null) {
  // Don't duplicate
  if (questions.find(q => q.text === text)) return;
  questions.push({ text, type, fieldId });

  const list = document.getElementById('questionsList');
  // Remove empty state
  const empty = list.querySelector('.empty-state');
  if (empty) empty.remove();

  const card = document.createElement('div');
  card.className = 'question-card';
  card.dataset.fieldId = fieldId || '';

  const typeBadge = getTypeBadge(type);

  card.innerHTML = `
    <div class="q-header">
      <span class="q-type-badge ${type}">${typeBadge}</span>
      <span class="q-text">${escapeHtml(text)}</span>
      <span class="q-toggle">▾</span>
    </div>
    <div class="q-body">
      <textarea class="answer-area" placeholder="Generated answer will appear here. You can edit it before using."></textarea>
      <div class="q-actions">
        <button class="q-btn q-btn-generate">✦ Generate</button>
        <button class="q-btn q-btn-inject" style="display:none">↳ Insert to Page</button>
        <button class="q-btn q-btn-copy" style="display:none">⎘ Copy</button>
      </div>
    </div>
  `;

  const header = card.querySelector('.q-header');
  const body = card.querySelector('.q-body');
  const toggle = card.querySelector('.q-toggle');
  const genBtn = card.querySelector('.q-btn-generate');
  const injectBtn = card.querySelector('.q-btn-inject');
  const copyBtn = card.querySelector('.q-btn-copy');
  const textarea = card.querySelector('.answer-area');

  // Toggle open/close
  header.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    const isOpen = body.classList.toggle('open');
    toggle.textContent = isOpen ? '▴' : '▾';
  });

  // Open by default
  body.classList.add('open');
  toggle.textContent = '▴';

  // Generate answer
  genBtn.addEventListener('click', async () => {
    await generateAnswer(text, type, textarea, genBtn, injectBtn, copyBtn, fieldId);
  });

  // Inject into page
  injectBtn.addEventListener('click', () => {
    if (!fieldId) { showToast('No field linked — copy and paste manually', 'error'); return; }
    sendToContent({ action: 'injectAnswer', fieldId, answer: textarea.value }, (res) => {
      showToast(res?.success ? 'Answer inserted into form!' : 'Could not insert — try copying');
    });
  });

  // Copy
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(textarea.value).then(() => showToast('Copied to clipboard!'));
  });

  list.appendChild(card);
}

// ── Generate AI answer ────────────────────────────────────────────────────────
async function generateAnswer(question, type, textarea, genBtn, injectBtn, copyBtn, fieldId) {
  const apiKey = settings.apiKey;
  if (!apiKey) {
    showToast('Add your API key in Settings first', 'error');
    return;
  }
  // Security note: the API key is stored in chrome.storage.local (unencrypted) and sent
  // directly from the browser. Use a key scoped to the minimum required permissions and
  // rotate it if you suspect it has been exposed.

  const company = document.getElementById('jobCompany').value.trim();
  const jobTitle = document.getElementById('jobTitle').value.trim();
  const jobNotes = document.getElementById('jobNotes').value.trim();

  genBtn.disabled = true;
  genBtn.textContent = '...';
  textarea.value = '';
  textarea.placeholder = 'Generating...';

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(question, company, jobTitle, jobNotes);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text || '';

    textarea.value = answer;
    textarea.placeholder = '';
    injectBtn.style.display = fieldId ? 'inline-block' : 'none';
    copyBtn.style.display = 'inline-block';
    showToast('Answer generated!');

  } catch (err) {
    textarea.placeholder = `Error: ${err.message}`;
    showToast(err.message, 'error');
  } finally {
    genBtn.disabled = false;
    genBtn.textContent = '✦ Regenerate';
  }
}

// ── Build prompts ─────────────────────────────────────────────────────────────
function buildSystemPrompt() {
  const style = settings.responseStyle || 'professional';
  const length = settings.answerLength || 'medium';

  const lengthGuide = {
    short: '1-2 concise sentences',
    medium: 'one solid paragraph (4-6 sentences)',
    long: '2-3 paragraphs with depth'
  }[length];

  const styleGuide = {
    professional: 'polished, confident, and professional',
    conversational: 'warm, genuine, and conversational — like talking to a real person',
    concise: 'direct and to the point — no filler words',
    detailed: 'thorough and comprehensive, showing depth of thought'
  }[style];

  const profileSummary = [
    profile.fullName     && `Name: ${profile.fullName}`,
    profile.currentTitle && `Current title: ${profile.currentTitle}`,
    profile.yearsExp     && `Years of experience: ${profile.yearsExp}`,
    profile.resumeSummary && `Background highlights:\n${profile.resumeSummary}`,
    profile.careerGoals  && `Career goals and values:\n${profile.careerGoals}`
  ].filter(Boolean).join('\n\n');

  return `You are a job application assistant helping a candidate craft compelling, authentic answers to job application questions.

CANDIDATE PROFILE:
${profileSummary || 'No profile saved — give general but strong answers.'}

WRITING STYLE: ${styleGuide}
RESPONSE LENGTH: ${lengthGuide}

RULES:
- Write in first person as the candidate
- Be specific and authentic — draw on real details from the profile when available
- Avoid generic clichés like "I'm a team player" or "I'm passionate about..."
- If company/role info is provided, tailor the answer to it specifically
- Do NOT include any preamble like "Here's an answer:" — just write the answer directly
- Do NOT use bullet points unless the question explicitly asks for a list
- Make it sound human and thoughtful, not like AI filler`;
}

function buildUserPrompt(question, company, jobTitle, jobNotes) {
  let context = '';
  if (company || jobTitle) {
    context = `\n\nJOB CONTEXT:\n`;
    if (company) context += `Company: ${company}\n`;
    if (jobTitle) context += `Role: ${jobTitle}\n`;
    if (jobNotes) context += `Additional notes: ${jobNotes}`;
  }
  return `Please write an answer for this job application question:

"${question}"${context}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTypeBadge(type) {
  return {
    essay: 'Essay',
    motivation: 'Motivation',
    experience: 'Experience',
    custom: 'Custom'
  }[type] || 'Question';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast show${type ? ' ' + type : ''}`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function sendToContent(msg, cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, msg, (res) => {
      if (cb) cb(res);
    });
  });
}
