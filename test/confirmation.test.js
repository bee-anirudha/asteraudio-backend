const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomInt } = require('node:crypto');
const { spawn } = require('node:child_process');

test('payment event is confirmed by the separate backend before Beeceptor gets a response', async () => {
  const forwarded = [];
  const checkout = http.createServer(async (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/payment-confirmations');
    assert.equal(req.headers['x-confirmation-token'], 'local-test-token');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    forwarded.push(JSON.parse(raw));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true, orderId: forwarded.at(-1).data.orderId }));
  });
  await new Promise(resolve => checkout.listen(0, '127.0.0.1', resolve));
  const checkoutPort = checkout.address().port;
  const backendPort = randomInt(30000, 40000);
  const backend = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: String(backendPort), APP_CONFIRMATION_URL: `http://127.0.0.1:${checkoutPort}/api/payment-confirmations`, CONFIRMATION_TOKEN: 'local-test-token' },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${backendPort}`;
  const event = { event: 'payment.completed', data: { paymentId: 'PAY-9001', orderId: 'ORD-1042', amount: '49.99', currency: 'USD', status: 'succeeded' } };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { ready = (await (await fetch(`${base}/health`)).json()).ready; if (ready) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(ready, true);
    const invalid = await fetch(`${base}/webhooks/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...event, data: { ...event.data, status: 'failed' } }) });
    assert.equal(invalid.status, 422);
    assert.equal(forwarded.length, 0);
    const confirmed = await fetch(`${base}/webhooks/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
    assert.equal(confirmed.status, 200);
    assert.deepEqual(await confirmed.json(), { confirmed: true, orderId: 'ORD-1042', paymentId: 'PAY-9001' });
    assert.deepEqual(forwarded, [event]);
    const activity = await (await fetch(`${base}/api/confirmations`)).json();
    assert.equal(activity[0].status, 'Confirmed');
    assert.equal(activity[0].responseStatus, 200);
  } finally {
    backend.kill();
    await new Promise(resolve => checkout.close(resolve));
  }
});
