const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_SERVICE_KEY ||= 'test-service-key';
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';

const express = require('express');
const encryptionRouter = require('../routes/encryption');

test('encryption initialization reuses the session key after serialization', async (t) => {
  const session = {
    id: 'test-session-secret',
    studentId: 'student-1'
  };
  const app = express();

  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = session;
    req.sessionID = 'test-session-id';
    next();
  });
  app.use('/api/encryption', encryptionRouter);

  const server = app.listen(0);
  t.after(() => server.close());

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const initUrl = `http://127.0.0.1:${server.address().port}/api/encryption/init`;
  const initialize = async () => {
    const response = await fetch(initUrl, { method: 'POST' });
    assert.equal(response.status, 200);
    return response.json();
  };

  const first = await initialize();

  // Mirror express-session/connect-pg-simple's JSON round trip.
  session.encryptionContext = JSON.parse(JSON.stringify(session.encryptionContext));

  const second = await initialize();

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(second.encryptionKey, first.encryptionKey);
});
