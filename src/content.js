// content.js — Job Application Assistant
// Plugin architecture: each platform registers its own field detectors and question scrapers.
// Core engine runs all registered plugins and deduplicates results.

(function () {
  'use strict';

  // ── Platform detection ─────────────────────────────────────────────────────
  const hostname = window.location.hostname;
  const parentUrl = (() => { try { return window.top.location.href; } catch { return ''; } })();
  const ownSearch = window.location.search;

  const PLATFORM =
      hostname.includes('linkedin.com')                               ? 'linkedin'
    : hostname.includes('workday') || hostname.includes('myworkdayjobs') ? 'workday'
    : hostname.includes('greenhouse.io')                              ? 'greenhouse'
    : hostname.includes('lever.co')                                   ? 'lever'
    : hostname.includes('ashbyhq.com')                                ? 'ashby'
    : parentUrl.includes('gh_jid=') || ownSearch.includes('gh_jid=') ? 'greenhouse'
    : parentUrl.includes('ashby_jid=')                                ? 'ashby'
    : 'generic';

  // ── Field mapping ──────────────────────────────────────────────────────────
  const FILL_MAP = [
    { patterns: ['first name', 'firstname', 'given name', 'preferred name', 'legal first'], field: 'firstName' },
    { patterns: ['last name', 'lastname', 'surname', 'family name', 'legal last'],          field: 'lastName' },
    { patterns: ['full name', 'your name', 'candidate name', 'applicant name', 'legal name', 'name'], field: 'fullName' },
    { patterns: ['email', 'e-mail', 'email address', 'work email'],                         field: 'email' },
    { patterns: ['phone', 'telephone', 'mobile', 'cell', 'phone number', 'contact number'], field: 'phone' },
    { patterns: ['city', 'current location', 'your location', 'where are you located', 'city, state', 'city/state', 'location (city'], field: 'location' },
    { patterns: ['linkedin', 'linked in', 'linkedin url', 'linkedin profile', 'linkedin.com'], field: 'linkedin' },
    { patterns: ['github', 'github url', 'github profile', 'github.com'],                   field: 'github' },
    { patterns: ['portfolio', 'portfolio url', 'personal site', 'personal url', 'personal website'], field: 'portfolio' },
    { patterns: ['other website', 'other url', 'website url', 'your website', 'web site', 'blog'], field: 'portfolio' },
    { patterns: ['current title', 'current role', 'job title', 'current job title', 'your title', 'your current title'], field: 'currentTitle' },
    // Diversity
    { patterns: ['gender identity', 'gender expression', 'what is your gender', 'your gender', 'gender'], field: 'diversityGender' },
    { patterns: ['race', 'ethnicity', 'racial', 'ethnic background', 'race/ethnicity', 'race / ethnicity', 'ethnicity(ies)'], field: 'diversityRace' },
    { patterns: ['veteran status', 'protected veteran', 'military status', 'military service', 'veteran'], field: 'diversityVeteran' },
    { patterns: ['disability', 'disabled', 'disability status', 'physical or mental', 'accommodation'], field: 'diversityDisability' },
    { patterns: ['hispanic or latino', 'hispanic/latino', 'are you hispanic', 'identify as hispanic'], field: 'diversityHispanic' },
    { patterns: ['transgender', 'identify as transgender', 'do you identify as transgender'],            field: 'diversityTransgender' },
    { patterns: ['sexual orientation', 'how do you identify your sexual', 'sexuality'],                  field: 'diversitySexualOrientation' },
    { patterns: ['communities', 'which of the following communities'],                                   field: 'diversityCommunities' },
    { patterns: ['age range', 'age group', 'what is your age', 'current age'],                          field: 'diversityAge' },
  ];

  const PROFILE_KEYS = [
    'fullName', 'email', 'phone', 'location', 'linkedin', 'github', 'portfolio',
    'currentTitle', 'yearsExp', 'resumeSummary', 'careerGoals',
    'diversityGender', 'diversityRace', 'diversityVeteran', 'diversityDisability',
    'diversityHispanic', 'diversityTransgender', 'diversitySexualOrientation',
    'diversityCommunities', 'diversityAge',
  ];

  const IGNORE_PATTERNS = [
    'how did you hear', 'how did you find', 'referred by', 'referral',
    'cover letter', 'additional information', 'anything else', 'tell us more',
    'salary', 'compensation', 'expected salary', 'desired salary',
    'start date', 'available to start', 'notice period',
    'pronouns', 'preferred pronouns',
  ];

  const ESSAY_KEYWORDS = [
    'why do you want', 'why are you interested', 'why this company', 'why this role',
    'tell us about yourself', 'describe yourself', 'tell me about', 'what motivates',
    'why should we', 'what are your strengths', 'what are your weaknesses',
    'greatest achievement', 'biggest challenge', 'where do you see yourself',
    'how would you describe', 'what makes you', 'cover letter', 'additional information',
    'anything else', 'comments', 'what can you bring', 'career goals',
    'how do you handle', 'what experience do you have', 'why leave', 'why are you leaving',
    'salary expectations', 'notice period', 'visa', 'sponsorship', 'briefly describe'
  ];

  const QUESTION_TYPES = {
    motivation:  ['why do you want', 'why are you interested', 'why this company', 'why this role', 'what motivates'],
    experience:  ['experience', 'background', 'tell us about', 'describe your', 'have you ever', 'how have you'],
    essay:       ['tell me about yourself', 'describe yourself', 'additional', 'cover letter', 'comments', 'anything else']
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // PLUGIN REGISTRY
  // Each plugin: { id, detect(profile) → [{el, value, type}] }
  // To add a new platform: registerPlugin({ id: 'mypf:...', detect(profile) { ... } })
  // Nothing else needs to change.
  // ══════════════════════════════════════════════════════════════════════════════
  const plugins = [];
  function registerPlugin(plugin) { plugins.push(plugin); }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  function resolveLabel(labelStr, profile) {
    if (!labelStr) return null;
    const lower = labelStr.toLowerCase();
    if (IGNORE_PATTERNS.some(p => lower.includes(p))) return null;
    for (const mapping of FILL_MAP) {
      if (mapping.patterns.some(p => lower.includes(p))) {
        return profile[mapping.field] || null;
      }
    }
    return null;
  }

  function scoreMatch(optionText, target) {
    const o = optionText.toLowerCase().trim();
    const t = target.toLowerCase().trim();
    if (o === t)                             return 4;
    if (o.startsWith(t) || t.startsWith(o)) return 2;
    if (o.includes(t) || t.includes(o))     return 1;
    return 0;
  }

  function bestMatch(items, target, getText) {
    let best = null, bestScore = 0;
    items.forEach(item => {
      const score = scoreMatch(getText(item), target);
      if (score > bestScore) { bestScore = score; best = item; }
    });
    return bestScore > 0 ? best : null;
  }

  function cleanLabel(el) {
    return (el && el.textContent || '').replace(/\s*\*\s*/g, '').replace(/\s+/g, ' ').trim();
  }

  function getFieldLabel(el) {
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return cleanLabel(lbl);
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy.split(' ').map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
      if (text) return text;
    }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    const wrapping = el.closest('label');
    if (wrapping) return cleanLabel(wrapping);
    const prev = el.previousElementSibling;
    if (prev) { const t = prev.textContent.trim(); if (t && t.length < 200) return t; }
    const container = el.closest(
      '[class*="field"], [class*="Field"], [class*="form-group"], [class*="FormGroup"], ' +
      '[class*="input-wrapper"], [class*="InputWrapper"], fieldset, [class*="question"]'
    );
    if (container) {
      const lbl = container.querySelector('label, legend, [class*="label"], [class*="Label"], [class*="title"], [class*="Title"]');
      if (lbl && lbl !== el) { const t = cleanLabel(lbl); if (t) return t; }
    }
    let node = el.parentElement;
    for (let i = 0; i < 5; i++) {
      if (!node) break;
      const directText = Array.from(node.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent.trim()).filter(Boolean).join(' ');
      if (directText && directText.length > 2 && directText.length < 150) return directText;
      const childLabel = node.querySelector(':scope > label, :scope > legend, :scope > span[class*="label" i], :scope > div[class*="label" i]');
      if (childLabel && childLabel !== el) { const t = cleanLabel(childLabel); if (t) return t; }
      node = node.parentElement;
    }
    return el.placeholder || el.name || el.id || '';
  }

  function getRadioGroupLabel(firstInput) {
    const fieldset = firstInput.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend) return legend.textContent.trim();
    }
    const group = firstInput.closest('[role="group"], [role="radiogroup"]');
    if (group) {
      const byId = group.getAttribute('aria-labelledby');
      if (byId) { const el = document.getElementById(byId); if (el) return el.textContent.trim(); }
      const ariaLabel = group.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel;
    }
    let node = firstInput.parentElement;
    for (let i = 0; i < 8; i++) {
      if (!node) break;
      for (const child of node.children) {
        if (child.contains(firstInput)) continue;
        const tag = child.tagName;
        const text = child.textContent.trim();
        if (!text || text.length > 80) continue;
        if (['H1','H2','H3','H4','H5','H6','LEGEND','STRONG','B'].includes(tag)) return text;
        if (child.matches('[class*="label" i], [class*="title" i], [class*="heading" i], [class*="question" i]')) return text;
      }
      node = node.parentElement;
    }
    return firstInput.name || '';
  }

  // ── Setters ────────────────────────────────────────────────────────────────

  function setInputValue(el, value) {
    el.focus(); el.click();
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.select();
    const inserted = document.execCommand('insertText', false, value);
    if (!inserted || el.value !== value) {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, value); else el.value = value;
      el.dispatchEvent(new InputEvent('input',  { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
      el.dispatchEvent(new Event('change',      { bubbles: true, cancelable: true }));
    }
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true, cancelable: true }));
  }

  function setSelectValue(select, targetText) {
    select.focus();
    const target = targetText.toLowerCase();
    let matched = false;
    for (const opt of select.options) {
      if (opt.text.toLowerCase().includes(target) || opt.value.toLowerCase().includes(target)) {
        select.value = opt.value; matched = true; break;
      }
    }
    if (!matched) return;
    select.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    select.dispatchEvent(new Event('input',  { bubbles: true, cancelable: true }));
    select.dispatchEvent(new FocusEvent('blur', { bubbles: true, cancelable: true }));
  }

  function setCheckableValue(input) {
    if (input.checked) return;
    input.focus(); input.checked = true;
    input.dispatchEvent(new MouseEvent('click',  { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event('change',      { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event('input',       { bubbles: true, cancelable: true }));
    input.dispatchEvent(new FocusEvent('blur',   { bubbles: true, cancelable: true }));
  }

  // Opens a react-select and clicks the best matching option.
  // optionSelector can be customized per platform.
  function setReactSelectValue(control, targetText, optionSelector) {
    optionSelector = optionSelector || '[class*="select__option"], [role="option"]';
    const target = targetText.toLowerCase();
    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      const options = [...document.querySelectorAll(optionSelector)];
      if (options.length > 0) {
        clearInterval(poll);
        const match = bestMatch(options, target, o => o.textContent.trim());
        if (match) {
          match.scrollIntoView({ block: 'nearest' });
          match.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
          match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
          match.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, button: 0 }));
          match.click();
        } else {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        }
      } else if (attempts > 30) clearInterval(poll);
    }, 50);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CORE PLUGINS
  // ══════════════════════════════════════════════════════════════════════════════

  registerPlugin({
    id: 'core:text-inputs',
    detect(profile) {
      const results = [];
      document.querySelectorAll(
        'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type])'
      ).forEach(input => {
        if (input.value || !input.offsetParent) return;
        const combined = [
          getFieldLabel(input), input.placeholder, input.name, input.id,
          input.getAttribute('aria-label'),
          ...Array.from(input.attributes).filter(a => a.name.startsWith('data-')).map(a => a.value),
          input.getAttribute('autocomplete')
        ].filter(Boolean).join(' ');
        const value = resolveLabel(combined, profile);
        if (value) results.push({ el: input, value, type: 'input' });
      });
      return results;
    }
  });

  registerPlugin({
    id: 'core:native-select',
    detect(profile) {
      const results = [];
      document.querySelectorAll('select').forEach(select => {
        if ((select.value && select.value !== '' && select.value !== '0') || !select.offsetParent) return;
        const combined = [getFieldLabel(select), select.name, select.id, select.getAttribute('aria-label')].filter(Boolean).join(' ');
        const value = resolveLabel(combined, profile);
        if (value) results.push({ el: select, value, type: 'select' });
      });
      return results;
    }
  });

  registerPlugin({
    id: 'core:radio-groups',
    detect(profile) {
      const results = [];
      const groups = {};
      document.querySelectorAll('input[type="radio"]').forEach(radio => {
        const key = radio.name || radio.closest('fieldset')?.id || radio.id;
        if (key) { if (!groups[key]) groups[key] = []; groups[key].push(radio); }
      });
      Object.values(groups).forEach(radios => {
        if (radios.some(r => r.checked)) return;
        const value = resolveLabel(getRadioGroupLabel(radios[0]), profile);
        if (!value) return;
        const match = bestMatch(radios, value, r => (
          (r.id && document.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.textContent) ||
          r.closest('label')?.textContent || r.getAttribute('aria-label') || r.value || ''
        ));
        if (match) results.push({ el: match, value, type: 'radio' });
      });
      return results;
    }
  });

  registerPlugin({
    id: 'core:checkbox-groups',
    detect(profile) {
      const results = [];
      const groups = {};
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        const key = cb.name || cb.closest('fieldset')?.id || 'ungrouped';
        if (!groups[key]) groups[key] = []; groups[key].push(cb);
      });
      Object.values(groups).forEach(checkboxes => {
        if (checkboxes.every(c => c.checked)) return;
        const value = resolveLabel(getRadioGroupLabel(checkboxes[0]), profile);
        if (!value) return;
        value.split(',').map(v => v.trim()).filter(Boolean).forEach(target => {
          const match = bestMatch(checkboxes, target, c => (
            (c.id && document.querySelector(`label[for="${CSS.escape(c.id)}"]`)?.textContent) ||
            c.closest('label')?.textContent || c.getAttribute('aria-label') || c.value || ''
          ));
          if (match) results.push({ el: match, value: target, type: 'checkbox' });
        });
      });
      return results;
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PLATFORM PLUGINS
  // To add a new platform: copy the template below, fill in the detect() logic,
  // uncomment, and it will automatically be included in every fill pass.
  // ══════════════════════════════════════════════════════════════════════════════

  // Greenhouse — react-select BEM classes confirmed via console inspection
  registerPlugin({
    id: 'greenhouse:react-select',
    detect(profile) {
      if (PLATFORM !== 'greenhouse' && PLATFORM !== 'generic') return [];
      const results = [];
      document.querySelectorAll('.select__placeholder, [class*="select__placeholder"]').forEach(placeholder => {
        if (!placeholder.offsetParent) return;
        const container = placeholder.closest('[class*="select__container"], .select__container');
        if (!container) return;
        if (container.querySelector('[class*="select__single-value"]')) return;
        const labelEl = container.querySelector('label, [class*="select__label"]');
        if (!labelEl) return;
        const value = resolveLabel(cleanLabel(labelEl), profile);
        if (!value) return;
        const control = container.querySelector('[class*="select__control"], div.select');
        if (control) results.push({ el: control, value, type: 'reactSelect' });
      });
      return results;
    }
  });

  // ── TEMPLATES for future platforms ────────────────────────────────────────
  // Lever: uncomment and fill in when DOM structure is confirmed from console logs
  // registerPlugin({
  //   id: 'lever:custom-dropdowns',
  //   detect(profile) {
  //     if (PLATFORM !== 'lever') return [];
  //     const results = [];
  //     // TODO: paste console log findings here to identify class names
  //     // Example: document.querySelectorAll('[class*="???"]').forEach(...)
  //     return results;
  //   }
  // });

  // Ashby: uncomment and fill in when DOM structure is confirmed
  // registerPlugin({
  //   id: 'ashby:custom-dropdowns',
  //   detect(profile) {
  //     if (PLATFORM !== 'ashby') return [];
  //     const results = [];
  //     // TODO: paste console log findings here
  //     return results;
  //   }
  // });

  // Workday: uses data-automation-id attributes instead of label text
  // registerPlugin({
  //   id: 'workday:automation-ids',
  //   detect(profile) {
  //     if (PLATFORM !== 'workday') return [];
  //     const WORKDAY_MAP = {
  //       'legalNameSection_firstName': profile.firstName,
  //       'legalNameSection_lastName':  profile.lastName,
  //       'email':                      profile.email,
  //       // ... add more as discovered
  //     };
  //     const results = [];
  //     Object.entries(WORKDAY_MAP).forEach(([automationId, value]) => {
  //       if (!value) return;
  //       const el = document.querySelector(`[data-automation-id="${automationId}"]`);
  //       if (el && !el.value) results.push({ el, value, type: 'input' });
  //     });
  //     return results;
  //   }
  // });

  // ══════════════════════════════════════════════════════════════════════════════
  // ENGINE
  // ══════════════════════════════════════════════════════════════════════════════

  function autoFillForm(rawProfile) {
    const profile = {
      ...rawProfile,
      firstName: rawProfile.fullName?.split(' ')[0] || '',
      lastName:  rawProfile.fullName?.split(' ').slice(1).join(' ') || '',
    };

    const seen = new Set();
    const toFill = [];
    for (const plugin of plugins) {
      let items;
      try { items = plugin.detect(profile); }
      catch (e) { console.warn(`[JAA] Plugin "${plugin.id}" threw:`, e); continue; }
      for (const item of items) {
        if (!seen.has(item.el)) { seen.add(item.el); toFill.push(item); }
      }
    }

    let delay = 0;
    toFill.forEach(({ el, value, type }) => {
      const gap = (type === 'reactSelect' || type === 'customSelect') ? 600 : 100;
      setTimeout(() => {
        try {
          if      (type === 'select')                       setSelectValue(el, value);
          else if (type === 'reactSelect')                  setReactSelectValue(el, value);
          else if (type === 'customSelect')                 setReactSelectValue(el, value, '[role="option"], [class*="option"]');
          else if (type === 'radio' || type === 'checkbox') setCheckableValue(el);
          else                                              setInputValue(el, value);
        } catch (e) { console.warn('[JAA] Fill error:', e); }
      }, delay);
      delay += gap;
    });

    return toFill.length;
  }

  // ── Question detection ─────────────────────────────────────────────────────
  function detectQuestions() {
    const found = [], seen = new Set();

    function isEssay(text) {
      const lower = text.toLowerCase();
      return ESSAY_KEYWORDS.some(k => lower.includes(k)) || text.endsWith('?');
    }
    function addQuestion(text, fieldId) {
      if (seen.has(text)) return;
      seen.add(text);
      found.push({ text, type: classifyQuestion(text), fieldId: fieldId || null });
    }

    document.querySelectorAll('textarea, [contenteditable="true"]').forEach((el, i) => {
      const label = getFieldLabel(el);
      if (label && isEssay(label)) {
        const id = el.id || el.name || `jaa-field-${i}`;
        if (!el.id) el.dataset.jaaId = id;
        addQuestion(label, id);
      }
    });

    document.querySelectorAll('label, legend, [class*="label"], [class*="question"]').forEach(lbl => {
      const text = lbl.textContent.trim();
      if (text.length > 15 && text.length < 500 && isEssay(text)) {
        addQuestion(text, lbl.htmlFor || lbl.getAttribute('for'));
      }
    });

    return found;
  }

  function classifyQuestion(text) {
    const lower = text.toLowerCase();
    for (const [type, keywords] of Object.entries(QUESTION_TYPES)) {
      if (keywords.some(k => lower.includes(k))) return type;
    }
    return 'custom';
  }

  // ── Page info ──────────────────────────────────────────────────────────────
  function extractPageInfo() {
    const info = { company: '', title: '', platform: PLATFORM };
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd.textContent);
        if (data.hiringOrganization?.name) info.company = data.hiringOrganization.name;
        if (data.title) info.title = data.title;
      } catch {}
    }
    const sel = {
      linkedin:   { title: '.jobs-unified-top-card__job-title, .topcard__title', company: '.jobs-unified-top-card__company-name' },
      workday:    { title: '[data-automation-id="jobPostingHeader"] h2', company: '[data-automation-id="company-name"]' },
      greenhouse: { title: '.app-title, h1.heading', company: '.company-name, .header--title' },
      lever:      { title: '.posting-title h2, .posting-headline h2', company: null },
      ashby:      { title: 'h1, [class*="JobTitle"]', company: null },
    }[PLATFORM];
    if (sel) {
      if (sel.title)   info.title   = info.title   || document.querySelector(sel.title)?.textContent?.trim() || '';
      if (sel.company) info.company = info.company || document.querySelector(sel.company)?.textContent?.trim() || '';
    }
    if (PLATFORM === 'ashby') {
      const parts = window.location.pathname.split('/').filter(Boolean);
      if (parts[0]) info.company = info.company || parts[0].replace(/-/g, ' ');
    }
    if (!info.title || !info.company) {
      const parts = document.title.split(/[\-–|@]/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) { info.title = info.title || parts[0]; info.company = info.company || parts[1]; }
    }
    return info;
  }

  // ── Hydration wait ─────────────────────────────────────────────────────────
  function waitForReactHydration(cb, timeout = 4000, interval = 150) {
    const start = Date.now();
    function check() {
      const inputs = document.querySelectorAll('input:not([type="hidden"]):not([disabled]), textarea:not([disabled])');
      const ready = Array.from(inputs).some(el => el.getBoundingClientRect().width > 0 && !el.disabled && !el.readOnly);
      if (ready) setTimeout(cb, 300);
      else if (Date.now() - start < timeout) setTimeout(check, interval);
      else cb();
    }
    check();
  }

  function highlightFields() {
    document.querySelectorAll('input, textarea, select, [contenteditable="true"]').forEach(el => {
      el.style.outline = '2px solid #c9a96e'; el.style.outlineOffset = '2px'; el.dataset.jaaHighlighted = 'true';
    });
  }
  function clearHighlights() {
    document.querySelectorAll('[data-jaa-highlighted]').forEach(el => {
      el.style.outline = ''; el.style.outlineOffset = ''; delete el.dataset.jaaHighlighted;
    });
  }
  function injectAnswer(fieldId, answer) {
    const escaped = CSS.escape(fieldId);
    const el = document.getElementById(fieldId)
      || document.querySelector(`[name="${escaped}"]`)
      || document.querySelector(`[data-jaa-id="${escaped}"]`);
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      setInputValue(el, answer);
    } else if (el.contentEditable === 'true') {
      el.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, answer);
      el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    }
    return true;
  }

  // ── Message listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    switch (msg.action) {
      case 'getPageInfo':      sendResponse(extractPageInfo()); break;
      case 'detectQuestions':  sendResponse({ questions: detectQuestions() }); break;
      case 'highlight':        highlightFields(); sendResponse({ ok: true }); break;
      case 'clearHighlight':   clearHighlights(); sendResponse({ ok: true }); break;
      case 'injectAnswer':     sendResponse({ success: injectAnswer(msg.fieldId, msg.answer) }); break;
      case 'autoFill':
        chrome.storage.local.get(PROFILE_KEYS, (profile) => {
          waitForReactHydration(() => {
            const filled = autoFillForm(profile);
            sendResponse({ message: `Filled ${filled} field${filled !== 1 ? 's' : ''}` });
          });
        });
        return true;
    }
    return true;
  });

})();
