// API integration tests. They start the app in this process against the database in .env, which
// must have the schema and `npm run seed` applied. Run with `npm test`; no running server needed.
// Writes go to a TEST-* treaty that is deleted, with its decisions, at the end.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const app = require('./index');
const pool = require('./config/database');

const DEMO = { email: 'demo@nexus.com', password: process.env.DEMO_PASSWORD };
const CODE = `TEST-${Date.now()}`;
const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000';

let server;
let base;
let token;

// Sends JSON (or a raw string) with the session token and returns { status, data }.
const api = async (method, path, { body, raw, auth = token } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(base + path, { method, headers, body: raw ?? (body && JSON.stringify(body)) });
  return { status: res.status, data: await res.json() };
};

// Each case is [name, response, expected status]; failures must also have a JSON { success: false } body.
const expectErrors = (cases) => {
  for (const [name, res, status] of cases) {
    assert.equal(res.status, status, `${name}: expected ${status}, got ${res.status} ${JSON.stringify(res.data)}`);
    assert.equal(res.data.success, false, `${name}: expected a JSON { success: false } body`);
  }
};

before(async () => {
  assert.ok(DEMO.password, 'Set DEMO_PASSWORD in .env and run npm run seed');
  server = app.listen(0);
  await once(server, 'listening');
  base = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  // Always close the server and pool, even if cleanup fails (e.g. the database rejects the
  // credentials); otherwise the open server keeps the process, and npm test, running forever.
  try {
    await pool.query(
      'DELETE FROM decision WHERE treaty_id IN (SELECT treaty_id FROM treaty WHERE treaty_code = $1)', [CODE]
    );
    await pool.query('DELETE FROM treaty WHERE treaty_code = $1', [CODE]);
  } finally {
    server?.closeAllConnections();
    server?.close();
    await pool.end();
  }
});

test('health check is public', async () => {
  const res = await api('GET', '/health');
  assert.equal(res.status, 200);
});

test('login checks the password and returns a JWT', async () => {
  const lastLogin = async () =>
    (await pool.query('SELECT last_login FROM app_user WHERE email = $1', [DEMO.email])).rows[0]?.last_login;
  const previous = await lastLogin();

  expectErrors([
    ['missing email', await api('POST', '/auth/login', { body: { password: 'x' } }), 400],
    ['missing password', await api('POST', '/auth/login', { body: { email: DEMO.email } }), 400],
    ['wrong password', await api('POST', '/auth/login', { body: { ...DEMO, password: `${DEMO.password}x` } }), 401],
    ['unknown email', await api('POST', '/auth/login', { body: { ...DEMO, email: 'nobody@nexus.com' } }), 401],
    ['malformed JSON', await api('POST', '/auth/login', { raw: '{bad' }), 400],
  ]);
  assert.deepEqual(await lastLogin(), previous, 'failed logins must not update last_login');

  const res = await api('POST', '/auth/login', { body: DEMO });
  assert.equal(res.status, 200, `login failed (did you run npm run seed?): ${JSON.stringify(res.data)}`);
  assert.equal(res.data.user.email, DEMO.email);
  assert.ok(!('password_hash' in res.data.user), 'the hash must never be sent');
  assert.notDeepEqual(await lastLogin(), previous);
  token = res.data.token;
});

test('protected routes reject missing and invalid tokens', async () => {
  expectErrors([
    ['no token', await api('GET', '/treaties', { auth: null }), 401],
    ['invalid token', await api('GET', '/treaties', { auth: 'nope' }), 401],
    ['no token on dashboard', await api('GET', '/dashboard/metrics', { auth: null }), 401],
    ['no token on cedents', await api('GET', '/cedents', { auth: null }), 401],
    ['no token on decisions', await api('POST', `/treaties/${UNKNOWN_ID}/decisions`, { auth: null }), 401],
    ['unknown route', await api('GET', '/nope'), 404],
  ]);
});

test('dashboard metrics match SQL over the treaty table', async () => {
  const res = await api('GET', '/dashboard/metrics');
  assert.equal(res.status, 200);
  const sql = (await pool.query(
    `SELECT COUNT(*)::int AS "totalTreaties", COALESCE(SUM(earned_premium), 0)::float8 AS "totalPremium",
            COALESCE(SUM(claims_incurred), 0)::float8 AS "totalClaims" FROM treaty`
  )).rows[0];
  for (const key of Object.keys(sql)) assert.equal(res.data.metrics[key], sql[key], key);
});

test('treaty list and detail', async () => {
  const list = await api('GET', '/treaties');
  assert.equal(list.status, 200);
  assert.ok(list.data.treaties.length > 0, 'no treaties: run npm run seed');

  const first = list.data.treaties[0];
  const detail = await api('GET', `/treaties/${first.treaty_id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.treaty.treaty_code, first.treaty_code);
  assert.match(detail.data.treaty.treaty_renewal_date, /^\d{4}-\d{2}-\d{2}$/, 'DATE should be YYYY-MM-DD');

  expectErrors([
    ['non-UUID treaty id', await api('GET', '/treaties/abc'), 400],
    ['unknown treaty id', await api('GET', `/treaties/${UNKNOWN_ID}`), 404],
  ]);
});

test('cedent list for pickers, sorted by name', async () => {
  const res = await api('GET', '/cedents');
  assert.equal(res.status, 200);
  // Same order as the database's collation (dictionary order), which JavaScript's < does not follow.
  const ids = (await pool.query('SELECT cedent_id FROM cedent ORDER BY name, cedent_id')).rows.map((r) => r.cedent_id);
  assert.deepEqual(res.data.cedents.map((c) => c.cedent_id), ids);
  assert.deepEqual(Object.keys(res.data.cedents[0]).sort(), ['cedent_id', 'email', 'name', 'region']);
});

let created;

test('creating a treaty derives loss ratio, risk and recommendation', async () => {
  const cedentId = (await pool.query('SELECT cedent_id FROM cedent LIMIT 1')).rows[0].cedent_id;
  const valid = {
    cedent_id: cedentId, treaty_code: CODE, name: 'Test Property Quota Share', treaty_type: 'Quota Share',
    business_line: 'Property', earned_premium: 1000000, claims_incurred: 850000,
    treaty_effective_date: '2026-01-01', treaty_renewal_date: '2027-01-01',
  };

  const res = await api('POST', '/treaties', { body: valid });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  created = res.data.treaty;
  assert.equal(created.treaty_code, CODE);
  assert.equal(created.loss_ratio, '0.8500');
  assert.equal(created.risk_level, 'High');
  assert.match(created.recommendation, /^Reprice or escalate: loss ratio 85\.00%/);
  assert.equal(created.treaty_status, 'active');
  assert.equal(created.treaty_renewal_date, '2027-01-01');
  assert.ok(created.cedent_name, 'the response includes the cedent');

  const post = (changes) => api('POST', '/treaties', { body: { ...valid, ...changes } });
  expectErrors([
    ['duplicate treaty_code', await post({}), 409],
    ['no body', await api('POST', '/treaties'), 400],
    ['unknown cedent', await post({ treaty_code: 'TEST-X', cedent_id: UNKNOWN_ID }), 400],
    ['bad treaty_type', await post({ treaty_type: 'Facultative' }), 400],
    ['blank name', await post({ name: '  ' }), 400],
    ['premium as text', await post({ earned_premium: '1000000' }), 400],
    ['zero premium', await post({ earned_premium: 0 }), 400],
    ['negative claims', await post({ claims_incurred: -1 }), 400],
    ['loss ratio too large to store', await post({ earned_premium: 1, claims_incurred: 100 }), 400],
    ['impossible date', await post({ treaty_effective_date: '2026-02-30' }), 400],
    ['renewal before effective', await post({ treaty_renewal_date: '2025-12-31' }), 400],
  ]);
});

test('decisions are recorded per treaty and user, newest first', async () => {
  assert.ok(created, 'needs the treaty from the previous test');
  const path = `/treaties/${created.treaty_id}/decisions`;

  const first = await api('POST', path, { body: { action: 'review', notes: '  Ask for loss runs  ' } });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.equal(first.data.decision.action, 'review');
  assert.equal(first.data.decision.notes, 'Ask for loss runs');
  assert.equal(first.data.decision.user_name, 'Demo User');
  assert.match(first.data.decision.decision_date, /^\d{4}-\d{2}-\d{2}$/);

  const second = await api('POST', path, { body: { action: 'reprice' } });
  assert.equal(second.status, 201);
  assert.equal(second.data.decision.notes, null);

  const history = await api('GET', path);
  assert.equal(history.status, 200);
  assert.deepEqual(history.data.decisions.map((d) => d.action), ['reprice', 'review']);
  assert.equal(history.data.decisions[1].user_name, 'Demo User');

  expectErrors([
    ['unknown action', await api('POST', path, { body: { action: 'approve' } }), 400],
    ['no action', await api('POST', path, { body: {} }), 400],
    ['notes not text', await api('POST', path, { body: { action: 'renew', notes: 5 } }), 400],
    ['non-UUID treaty id', await api('POST', '/treaties/abc/decisions', { body: { action: 'renew' } }), 400],
    ['unknown treaty (POST)', await api('POST', `/treaties/${UNKNOWN_ID}/decisions`, { body: { action: 'renew' } }), 404],
    ['unknown treaty (GET)', await api('GET', `/treaties/${UNKNOWN_ID}/decisions`), 404],
  ]);
});
