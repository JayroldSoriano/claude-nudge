const DEFAULTS = {
  port: 47831, showDone: true, showQuestion: true, showPermission: true, showIdle: false, autoDismissSec: 20, position: 'bottom-right', sound: false,
  escalation: 'full', escalationSound: true, escalateAt1: 15, escalateAt2: 30, escalateAt3: 60, snoozeMin: 5,
  relayUrl: '', // hosted relay for phone pairing; empty = the relay's default
};
const fields = Object.keys(DEFAULTS);
let settings = { ...DEFAULTS };

async function load() {
  settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  for (const f of fields) {
    const el = document.getElementById(f);
    if (el.type === 'checkbox') el.checked = !!settings[f];
    else el.value = settings[f];
  }
  refresh();
  refreshPhone();
}

for (const f of fields) {
  document.getElementById(f).addEventListener('change', async (e) => {
    const el = e.target;
    const value = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    settings[f] = value;
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

// ---------- Phone pairing: the local relay mints the code, the popup shows it as a QR ----------

const relayApi = (path, init) => fetch(`http://127.0.0.1:${settings.port}/${path}`, init).then(async (r) => {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body;
});

const $ = (id) => document.getElementById(id);
let pollTimer = null;
let pairExpiresAt = 0;

function showPairBox(r) {
  $('pairBox').hidden = false;
  $('pairCode').textContent = r.pairCode;
  $('pairRelay').textContent = r.relay;
  pairExpiresAt = Date.now() + (r.expiresInSeconds || 600) * 1000;
  // The QR carries nudge://pair?code=…&relay=…, which the app's scanner (and later its deep link) understands.
  const qr = qrcode(0, 'M');
  qr.addData(r.link);
  qr.make();
  $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  tickHint();
  // The hosted relay knows when the phone claims the code; switch to "paired" without a click.
  clearInterval(pollTimer);
  pollTimer = setInterval(refreshPhone, 3000);
}

function tickHint() {
  const left = Math.max(0, Math.round((pairExpiresAt - Date.now()) / 1000));
  $('pairHint').textContent = left ? `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}.` : 'Expired: tap Pair a phone again.';
}
setInterval(() => { if (!$('pairBox').hidden) tickHint(); }, 1000);

async function refreshPhone() {
  let s;
  try { s = await relayApi('pair/status'); } catch (_) {
    $('phoneState').textContent = 'Relay offline';
    $('pairStart').hidden = true; $('unpair').hidden = true;
    return;
  }
  const paired = s.paired && typeof s.phones === 'number' && s.phones > 0;
  $('pairStart').hidden = paired;
  $('unpair').hidden = !s.paired;
  $('relayRow').hidden = s.paired;
  if (paired) {
    $('phoneState').textContent = `Paired · ${s.phones} phone${s.phones === 1 ? '' : 's'}${s.devices ? `, push on ${s.devices}` : ''}`;
    $('pairBox').hidden = true;
    clearInterval(pollTimer); pollTimer = null;
  } else if (s.paired) {
    $('phoneState').textContent = s.error ? `Waiting for the phone (${s.error})` : s.pairCodeOpen ? 'Waiting for the phone to scan…' : 'Code expired';
    $('pairStart').hidden = false;
  } else {
    $('phoneState').textContent = 'Not paired';
  }
}

$('pairStart').addEventListener('click', async () => {
  $('pairStart').disabled = true;
  $('phoneState').textContent = 'Asking the relay…';
  try {
    const relay = (settings.relayUrl || '').trim() || undefined;
    const r = await relayApi('pair/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ relay }) });
    showPairBox(r);
    await refreshPhone();
  } catch (e) {
    $('phoneState').textContent = `Could not start pairing: ${e.message}`;
  } finally { $('pairStart').disabled = false; }
});

$('unpair').addEventListener('click', async () => {
  if (!confirm('Forget the phone? The approval hooks are removed too; nothing waits for the phone afterwards.')) return;
  try { await relayApi('pair/stop', { method: 'POST' }); } catch (_) { /* relay offline */ }
  $('pairBox').hidden = true;
  clearInterval(pollTimer); pollTimer = null;
  refreshPhone();
});

load();
