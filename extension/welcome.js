// Onboarding page opened on first install: copy buttons, and a live relay check that flips step 1 to done.
for (const [btnId, codeId] of [['copy', 'cmd'], ['copy-test', 'cmd-test']]) {
  const btn = document.getElementById(btnId);
  btn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(document.getElementById(codeId).textContent);
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });
}

let ticks = 0;
async function check() {
  const { relayStatus } = await chrome.runtime.sendMessage({ type: 'getStatus' });
  const connected = relayStatus === 'connected';
  const status = document.getElementById('status');
  status.classList.toggle('connected', connected);
  status.querySelector('span').textContent = connected ? 'Relay connected. Nudge is ready.' : 'Waiting for the relay (step 1)';
  document.getElementById('step-setup').classList.toggle('done', connected);
  // The service worker only retries every 30s; nudge it more often while the user is running setup.
  if (!connected && ticks++ % 2 === 0) chrome.runtime.sendMessage({ type: 'reconnect' });
}
check();
setInterval(check, 1500);
