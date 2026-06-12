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
    console.log("[LM-Source] Message received in background:", request);
    sendResponse({ status: "Background received message" });
    return true;
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") {
      console.log("[LM-Source] Tab updated:", tab.url);
    }
  });
})();
