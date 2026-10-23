const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-only-signing-secret-not-used-outside-tests';
process.env.ADMIN_EMAIL = 'admin@example.test';
process.env.ADMIN_PASSWORD = 'TestAdminPassword123!';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.NODE_ENV = 'test';
let server, base, token;
const { init, getDb } = require('../db');
const app = require('../server');
const sample = { first_name: 'Test', last_name: 'Guest', email: 'guest@example.test', date: '2099-05-10', time: '19:00', guests: 2 };
async function request(route, { method = 'GET', body, auth } = {}) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  await init();
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await request('/api/auth/login', { method: 'POST', body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
  assert.equal(login.status, 200);
  token = login.body.token;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

test('public homepage serves the dining page instead of the admin login', async () => {
  const html = await (await fetch(base)).text();
  assert.match(html, /id="experience"/);
});
test('reservation persists as pending, admin can confirm, and guests cannot read or alter it', async () => {
  const created = await request('/api/reservations', { method: 'POST', body: { ...sample, status: 'confirmed' } });
  assert.equal(created.status, 201);
  const route = `/api/reservations/${created.body.reservation_id}`;
  assert.equal((await request(route)).status, 401);
  assert.equal((await request(route + '/status', { method: 'PATCH', body: { status: 'confirmed' } })).status, 401);
  assert.equal((await request(route, { method: 'DELETE' })).status, 401);
  assert.equal((await request(route, { auth: token })).body.status, 'pending');
  assert.equal((await request(route + '/status', { method: 'PATCH', auth: token, body: { status: 'confirmed' } })).body.reservation.status, 'confirmed');
  assert.equal((await request(route + '/status', { method: 'PATCH', auth: token, body: { status: 'invented' } })).status, 400);
  assert.equal((await request(route, { auth: token })).body.status, 'confirmed');
});
test('invalid fields return 400 and never create a reservation', async () => {
  const beforeCount = getDb().prepare('SELECT COUNT(*) AS count FROM reservations').get().count;
  for (const change of [{ first_name: 7 }, { email: 'invalid' }, { date: 'not-a-date' }, { date: '2099-02-30' }, { date: '2000-01-01' }, { time: '25:70' }, { guests: 2.5 }, { guests: '2abc' }, { guests: [] }, { guests: 21 }, { notes: {} }]) {
    assert.equal((await request('/api/reservations', { method: 'POST', body: { ...sample, ...change } })).status, 400, JSON.stringify(change));
  }
  assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM reservations').get().count, beforeCount);
});
test('reservation lists and stats reject missing, tampered and expired tokens', async () => {
  for (const route of ['/api/reservations', '/api/reservations/stats/summary', '/api/menu/admin/all']) {
    assert.equal((await request(route)).status, 401);
    assert.equal((await request(route, { auth: token + 'tampered' })).status, 403);
    const expired = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: -1 });
    assert.equal((await request(route, { auth: expired })).status, 401);
  }
});
test('public menu works while menu mutations require admin login', async () => {
  assert.ok((await request('/api/menu')).body.items.length > 0);
  for (const [method, route] of [['POST', '/api/menu'], ['PUT', '/api/menu/1'], ['PATCH', '/api/menu/1/toggle'], ['DELETE', '/api/menu/1']]) {
    assert.equal((await request(route, { method, body: { name: 'Unauthorized' } })).status, 401);
  }
});
test('invalid login types and wrong passwords fail without issuing a token', async () => {
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: [], password: 'x' } })).status, 400);
  const invalid = await request('/api/auth/login', { method: 'POST', body: { email: process.env.ADMIN_EMAIL, password: 'wrong' } });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.token, undefined);
});
