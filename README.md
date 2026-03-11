# ✦ Job Application Assistant

A Chrome extension that auto-fills job application forms and generates AI-powered answers to open-ended questions using Claude.

## Features

- **Auto-fill** — Fills name, email, phone, location, LinkedIn, and more across LinkedIn, Workday, Greenhouse, and Lever
- **Question Detection** — Scans the page to find open-ended essay questions automatically
- **AI Answers** — Generates tailored answers using Claude (powered by your Anthropic API key)
- **Side Panel** — A persistent AI assistant panel that stays open while you navigate the form
- **Edit Before Submit** — All answers are editable before you insert them

## Supported Platforms

- LinkedIn Easy Apply
- Workday / myworkdayjobs.com
- Greenhouse.io
- Lever / jobs.lever.co
- Generic job application pages

---

## Setup (2 minutes)

### 1. Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `job-application-assistant` folder
5. The extension icon (✦) will appear in your toolbar

### 2. Add your profile

1. Click the extension icon
2. Go to the **Profile** tab
3. Fill in your name, email, phone, LinkedIn, and paste key resume highlights
4. Click **Save Profile**

### 3. Add your Anthropic API key

1. Click the extension icon
2. Go to the **Settings** tab
3. Paste your API key (starts with `sk-ant-`)
4. Get one at: https://console.anthropic.com/settings/keys
5. Click **Save Settings**

---

## How to Use

### On any job application page:

**Option A — Side Panel (recommended)**
1. Click the ✦ extension icon
2. Click **"Open AI Assistant Panel"**
3. The panel opens on the right side of your browser
4. Enter the company name and role (or let it auto-detect)
5. Click **Scan Page** to find questions
6. Click **✦ Generate** on any question to get an AI-crafted answer
7. Edit the answer, then click **↳ Insert to Page** or copy it manually

**Option B — Quick actions**
1. Click the ✦ extension icon
2. Click **⚡ Auto-Fill Form** to fill standard fields instantly
3. Click **🔍 Find Questions** to detect essay questions

---

## Tips

- The more detail you put in your **Resume Summary** and **Career Goals** fields, the more personalized the AI answers will be
- Always **review and personalize** generated answers — they're a strong starting draft, not a final answer
- Use the **Job Context** fields (company + role + notes) in the side panel for more tailored responses
- If a question isn't detected automatically, type it into the **"Add a Question Manually"** box at the bottom of the panel

---

## Privacy

- Your profile and API key are stored **locally** in Chrome's storage — they never leave your browser except when making API calls to Anthropic
- API calls go directly from your browser to `api.anthropic.com`
- No data is stored on any third-party server

---

## Folder Structure

```
job-application-assistant/
├── manifest.json          # Extension configuration
├── popup.html             # Toolbar popup
├── sidepanel.html         # AI assistant side panel
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── background.js      # Service worker
    ├── content.js         # Page interaction & form detection
    ├── content.css        # Injected styles
    ├── popup.js           # Popup logic
    └── sidepanel.js       # AI answer generation
```
