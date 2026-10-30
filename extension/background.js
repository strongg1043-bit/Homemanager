importScripts('config.js');

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-home-anchor',
    title: 'Open Home Anchor',
    contexts: ['action', 'page']
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'open-home-anchor') chrome.tabs.create({ url: APP_URL });
});
