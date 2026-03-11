// background.js — Service worker

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['responseStyle', 'answerLength'], (data) => {
    const defaults = {};
    if (!data.responseStyle) defaults.responseStyle = 'professional';
    if (!data.answerLength)  defaults.answerLength  = 'medium';
    if (Object.keys(defaults).length) chrome.storage.local.set(defaults);
  });
});

// Badge on supported pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  const supported = ['linkedin.com', 'myworkdayjobs.com', 'workday.com', 'greenhouse.io', 'lever.co', 'jobs.lever.co', 'ashbyhq.com'];
  const hasEmbedParam = tab.url.includes('gh_jid=') || tab.url.includes('ashby_jid=');
  const isSupported = supported.some(s => tab.url.includes(s)) || hasEmbedParam;
  chrome.action.setBadgeText({ tabId, text: isSupported ? '✓' : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#c9a96e' });
});
