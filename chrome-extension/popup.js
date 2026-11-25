const endpointInput = document.getElementById('endpoint');
const attachBtn = document.getElementById('attach');
const statusEl = document.getElementById('status');

chrome.storage?.local.get(['bugcastEndpoint'], (res) => {
  if (res?.bugcastEndpoint) {
    endpointInput.value = res.bugcastEndpoint;
  }
});

attachBtn.addEventListener('click', async () => {
  const endpoint = endpointInput.value.trim().replace(/\/+$/, '') || 'http://127.0.0.1:4173';
  chrome.storage?.local.set({ bugcastEndpoint: endpoint });
  statusEl.textContent = 'Injecting bridge...';
  statusEl.style.color = '#93c5fd';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      args: [endpoint],
      func: (baseUrl) => {
        if (window.__BUGCAST_BRIDGE_ACTIVE__) {
          console.info('[BugCast Bridge] Already active on this tab.');
          return;
        }
        const s = document.createElement('script');
        s.src = `${baseUrl}/bridge.js`;
        document.documentElement.appendChild(s);
      },
    });

    statusEl.textContent = 'Connected! Errors & failed fetch/XHR now stream to BugCast.';
    statusEl.style.color = '#86efac';
  } catch (err) {
    statusEl.textContent = `Failed: ${err.message}`;
    statusEl.style.color = '#fca5a5';
  }
});
