const DEFAULTS = {
  port: 47831, showDone: true, showQuestion: true, showPermission: true, showIdle: false, autoDismissSec: 20, position: 'bottom-right', sound: false,
  escalation: 'full', escalationSound: true, escalateAt1: 15, escalateAt2: 30, escalateAt3: 60, snoozeMin: 5,
};
const fields = Object.keys(DEFAULTS);

async function load() {
  const s = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  for (const f of fields) {
    const el = document.getElementById(f);
    if (el.type === 'checkbox') el.checked = !!s[f];
    else el.value = s[f];
  }
  refresh();
}

for (const f of fields) {
  document.getElementById(f).addEventListener('change', async (e) => {
    const el = e.target;
    const value = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    await chrome.storage.sync.set({ [f]: value });
  });
}

async function refresh() {
  const { relayStatus, recentEvents = [] } = await chrome.runtime.sendMessage({ type: 'getStatus' });
  const status = document.getElementById('status');
  const connected = relayStatus === 'connected';
  status.classList.toggle('connected', connected);
  status.querySelector('span').textContent = connected ? 'relay connected' : 'relay offline';
  document.getElementById('help').hidden = connected;
  const list = document.getElementById('recent');
  const shown = recentEvents.filter((ev) => ev.kind !== 'resolved');
  list.innerHTML = shown.length ? '' : '<div class="ev"><small>No nudges yet.</small></div>';
  for (const ev of [...shown].reverse()) {
    const d = document.createElement('div');
    d.className = 'ev';
    d.title = ev.message;
    const time = new Date(ev.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    d.innerHTML = `<b></b> <small></small> <span></span>`;
    d.querySelector('b').textContent = ev.title;
    d.querySelector('small').textContent = `${ev.project || ''} ${time}`;
    d.querySelector('span').textContent = ev.message;
    list.appendChild(d);
  }
}

document.getElementById('preview').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'previewNudge' });
  window.close();
});
document.getElementById('reconnect').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'reconnect' });
  setTimeout(refresh, 800);
});

load();
