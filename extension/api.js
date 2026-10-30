// Minimal Firebase REST client (Auth + Firestore) so the popup needs no SDK bundle.
const AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts';
const TOKEN_URL = 'https://securetoken.googleapis.com/v1/token';
const FS_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const ACTIVE_STATUSES = ['pending', 'accepted', 'needs_retry', 'submitted'];

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Request failed (${res.status})`);
  return data;
}

async function signIn(email, password) {
  const d = await postJson(`${AUTH_URL}:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    email, password, returnSecureToken: true
  });
  return { uid: d.localId, idToken: d.idToken, refreshToken: d.refreshToken, expiresAt: Date.now() + d.expiresIn * 1000 };
}

async function refreshSession(session) {
  const res = await fetch(`${TOKEN_URL}?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken })
  });
  const d = await res.json();
  if (!res.ok) throw new Error('Session expired');
  return { uid: d.user_id, idToken: d.id_token, refreshToken: d.refresh_token, expiresAt: Date.now() + Number(d.expires_in) * 1000 };
}

function fromValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}

function fromDoc(doc) {
  const out = { id: doc.name.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = fromValue(v);
  return out;
}

async function getProfile(session) {
  const res = await fetch(`${FS_URL}/users/${session.uid}`, { headers: { Authorization: `Bearer ${session.idToken}` } });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || 'Could not load profile');
  return fromDoc(d);
}

// Mirrors the app's "Today's Missions": active, non-onboarding tasks.
// Children see their own; parents see the whole household.
async function getTodaysChores(session, profile) {
  const statusFilter = {
    fieldFilter: {
      field: { fieldPath: 'status' },
      op: 'IN',
      value: { arrayValue: { values: ACTIVE_STATUSES.map(s => ({ stringValue: s })) } }
    }
  };
  const filters = [statusFilter];
  if (profile.role !== 'parent') {
    filters.push({ fieldFilter: { field: { fieldPath: 'assignedTo' }, op: 'EQUAL', value: { stringValue: session.uid } } });
  }
  const data = await postJson(`${FS_URL}/households/${profile.householdId}:runQuery`, {
    structuredQuery: {
      from: [{ collectionId: 'tasks' }],
      where: { compositeFilter: { op: 'AND', filters } }
    }
  }, { Authorization: `Bearer ${session.idToken}` });
  return data.filter(r => r.document).map(r => fromDoc(r.document)).filter(t => !t.isOnboardingTask);
}
