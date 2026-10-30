const $ = (id) => document.getElementById(id);
const status = $('status');
const STATE_LABEL = { pending: 'To do', accepted: 'Accepted', needs_retry: 'Retry', submitted: 'Awaiting review' };

function setStatus(msg, isError = false) {
  status.textContent = msg;
  status.classList.toggle('error', isError);
}

async function loadSession() {
  const { session } = await chrome.storage.local.get('session');
  if (!session) return null;
  if (session.expiresAt - Date.now() > 60_000) return session;
  try {
    const fresh = await refreshSession(session);
    await chrome.storage.local.set({ session: fresh });
    return fresh;
  } catch {
    await chrome.storage.local.remove('session');
    return null;
  }
}

function renderChores(tasks, isParent) {
  const list = $('chore-list');
  list.replaceChildren();
  $('empty').hidden = tasks.length > 0;
  for (const t of tasks) {
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.textContent = t.title;
    const sub = document.createElement('small');
    sub.textContent = [isParent ? t.assignedToName : null, STATE_LABEL[t.status]].filter(Boolean).join(' · ');
    left.appendChild(sub);
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = `${t.pointValue ?? 0} pts`;
    li.append(left, pts);
    list.appendChild(li);
  }
}

async function showChores(session) {
  $('login').hidden = true;
  $('chores').hidden = false;
  $('sign-out').hidden = false;
  setStatus('Loading…');
  try {
    const profile = await getProfile(session);
    if (!profile.householdId) { setStatus('Join or create a household in the app first.'); return; }
    renderChores(await getTodaysChores(session, profile), profile.role === 'parent');
    setStatus('');
  } catch (e) {
    setStatus(e.message, true);
  }
}

async function init() {
  if (!FIREBASE_API_KEY) {
    setStatus('Set FIREBASE_API_KEY in config.js to enable chores.', true);
    return;
  }
  const session = await loadSession();
  if (session) await showChores(session);
  else $('login').hidden = false;
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('Signing in…');
  try {
    // Only the refresh token is kept; the password is never stored.
    const session = await signIn($('email').value.trim(), $('password').value);
    $('password').value = '';
    await chrome.storage.local.set({ session });
    await showChores(session);
  } catch (err) {
    setStatus(err.message === 'INVALID_LOGIN_CREDENTIALS' ? 'Wrong email or password.' : err.message, true);
  }
});

$('sign-out').addEventListener('click', async () => {
  await chrome.storage.local.remove('session');
  $('chores').hidden = true;
  $('sign-out').hidden = true;
  $('login').hidden = false;
  setStatus('');
});


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
    setStatus('Link copied');
  } catch {
    setStatus('Could not copy link', true);
  }
});

init();
