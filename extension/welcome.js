// Onboarding page opened on first install: copy buttons, the connection code, and a live relay check that flips
// step 1 (relay running) and step 2 (code accepted) to done.
for (const [btnId, codeId] of [['copy', 'cmd'], ['copy-test', 'cmd-test']]) {
  const btn = document.getElementById(btnId);
  btn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(document.getElementById(codeId).textContent);
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });
}

const connectBtn = document.getElementById('connect');
connectBtn.addEventListener('click', async () => {
  const hint = document.getElementById('connect-hint');
  connectBtn.disabled = true;
  hint.textContent = 'Checking…';
  const r = await chrome.runtime.sendMessage({ type: 'connect', secret: document.getElementById('secret').value });
  connectBtn.disabled = false;
  hint.textContent = r && r.ok ? 'Connected.' : (r && r.error) || 'Could not connect.';
  if (r && r.ok) { document.getElementById('secret').value = ''; setTimeout(check, 800); }
});
document.getElementById('secret').addEventListener('keydown', (e) => { if (e.key === 'Enter') connectBtn.click(); });

let ticks = 0;
async function check() {
  const { relayStatus } = await chrome.runtime.sendMessage({ type: 'getStatus' });
  const connected = relayStatus === 'connected';
  const locked = relayStatus === 'locked';
  const status = document.getElementById('status');
  status.classList.toggle('connected', connected);
  status.querySelector('span').textContent = connected ? 'Relay connected. Nudge is ready.' : locked ? 'Relay running. Paste the code (step 2)' : 'Waiting for the relay (step 1)';
  document.getElementById('step-setup').classList.toggle('done', connected || locked);
  document.getElementById('step-connect').classList.toggle('done', connected);
  // The service worker only retries every 30s; nudge it more often while the user is running setup.
  if (!connected && !locked && ticks++ % 2 === 0) chrome.runtime.sendMessage({ type: 'reconnect' });
}
check();
setInterval(check, 1500);
