const status = document.getElementById('status');

// Reuse an already-open Home Anchor tab instead of piling up new ones.
document.getElementById('open-app').addEventListener('click', async () => {
  const [existing] = await chrome.tabs.query({ url: `${APP_URL}/*` });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: APP_URL });
  }
  window.close();
});

document.getElementById('open-new-tab').addEventListener('click', async () => {
  await chrome.tabs.create({ url: APP_URL });
  window.close();
});

document.getElementById('copy-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(APP_URL);
    status.textContent = 'Link copied';
  } catch {
    status.textContent = 'Could not copy link';
  }
});
