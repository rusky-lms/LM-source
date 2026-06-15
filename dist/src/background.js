(function() {
  "use strict";
  console.log("[LM-Source] Background service worker started.");
  chrome.runtime.onInstalled.addListener((details) => {
    console.log("[LM-Source] Extension installed or updated:", details.reason);
    chrome.storage.local.set({
      "lm-source-initialized": true,
      "lm-source-version": "1.1.0"
    }, () => {
      console.log("[LM-Source] Default settings initialized.");
    });
  });
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const type = request == null ? void 0 : request.type;
    console.log("[LM-Source] Background received message:", type, request);
    if (type === "LMS_OPEN_URL") {
      const url = request.url;
      if (!url || typeof url !== "string") {
        sendResponse({ success: false, error: "Invalid URL" });
        return false;
      }
      chrome.tabs.create({ url }, (tab) => {
        sendResponse({ success: true, tabId: tab == null ? void 0 : tab.id });
      });
      return true;
    }
    if (type === "LMS_DELIVER_HANDOFF_NEW_TAB") {
      const PLATFORM_URLS = {
        chatgpt: "https://chatgpt.com/",
        claude: "https://claude.ai/new",
        gemini: "https://gemini.google.com/app"
      };
      const url = PLATFORM_URLS[request.targetPlatform];
      if (!url) {
        sendResponse({ success: false });
        return false;
      }
      chrome.storage.local.set({ lms_pending_handoff: request.prompt }, () => {
        chrome.tabs.create({ url }, (tab) => {
          sendResponse({ success: true, tabId: tab == null ? void 0 : tab.id });
        });
      });
      return true;
    }
    sendResponse({ status: "Background received message", type });
    return true;
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") {
      console.log("[LM-Source] Tab updated:", tab.url);
    }
  });
})();
