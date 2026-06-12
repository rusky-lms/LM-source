// src/background.js
// Service Worker for LM-Source Extension
// Currently a minimal scaffold - logic will be added in later tasks

console.log('[LM-Source] Background service worker started.');

// Listen for extension installation or update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[LM-Source] Extension installed or updated:', details.reason);
  
  // Initialize default settings in storage
  chrome.storage.local.set({
    'lm-source-initialized': true,
    'lm-source-version': '1.1.0'
  }, () => {
    console.log('[LM-Source] Default settings initialized.');
  });
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[LM-Source] Message received in background:', request);
  
  // TODO: Handle various message types in later tasks
  // e.g., 'EXTRACT_CONTEXT', 'PIN_MESSAGE', 'HANDOFF_CONTEXT'
  
  sendResponse({ status: 'Background received message' });
  return true; // Keep channel open for async responses
});

// Listen for tab updates (useful for detecting page loads)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log('[LM-Source] Tab updated:', tab.url);
  }
});
