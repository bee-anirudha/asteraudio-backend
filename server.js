const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.PORT || 4174);
const APP_CONFIRMATION_URL = process.env.APP_CONFIRMATION_URL || '';
const CONFIRMATION_TOKEN = process.env.CONFIRMATION_TOKEN || '';
const BEECEPTOR_WEBHOOK_SECRET = process.env.BEECEPTOR_WEBHOOK_SECRET || '';
const recent = [];

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new Error('Request is too large');
  }
  return JSON.parse(raw || '{}');
}

function validEvent(body) {
  const data = body?.data;
  return body?.event === 'payment.completed'
    && data?.status === 'succeeded'
    && typeof data.paymentId === 'string' && /^PAY-[A-Za-z0-9-]+$/.test(data.paymentId)
    && typeof data.orderId === 'string' && /^ORD-[A-Za-z0-9-]+$/.test(data.orderId)
    && typeof data.amount === 'string' && /^\d+\.\d{2}$/.test(data.amount)
    && data.currency === 'USD';
}

async function receivePayment(req, res) {
  if (BEECEPTOR_WEBHOOK_SECRET && req.headers['x-demo-secret'] !== BEECEPTOR_WEBHOOK_SECRET) {
    return json(res, 401, { error: 'Unauthorized event.' });
  }
  const payload = await readJson(req);
  if (!validEvent(payload)) return json(res, 422, { error: 'Invalid payment.completed event.' });
  if (!APP_CONFIRMATION_URL || !CONFIRMATION_TOKEN) {
    return json(res, 503, { error: 'Checkout confirmation is not configured.' });
  }

  const { orderId, paymentId, amount, currency } = payload.data;
  const item = { orderId, paymentId, amount, currency, receivedAt: new Date().toISOString(), status: 'Pending', responseStatus: null };
  recent.unshift(item);
  if (recent.length > 50) recent.pop();

  try {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const response = await fetch(APP_CONFIRMATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Confirmation-Token': CONFIRMATION_TOKEN },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    item.responseStatus = response.status;
    if (!response.ok) {
      item.status = 'Failed';
      console.error(`Confirmation failed for ${orderId}: checkout returned ${response.status}`);
      return json(res, 502, { confirmed: false, orderId, error: 'Checkout rejected the confirmation.' });
    }
    item.status = 'Successful';
    console.log(`Payment ${paymentId} confirmed for ${orderId}`);
    return json(res, 200, { confirmed: true, orderId, paymentId });
  } catch (error) {
    item.status = 'Failed';
    console.error(`Confirmation failed for ${orderId}: ${error.message}`);
    return json(res, 502, { confirmed: false, orderId, error: 'Checkout could not be reached.' });
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { service: 'asteraudio-backend', ready: Boolean(APP_CONFIRMATION_URL && CONFIRMATION_TOKEN) });
    if (req.method === 'GET' && url.pathname === '/api/confirmations') return json(res, 200, recent);
    if (req.method === 'POST' && url.pathname === '/webhooks/payments') return await receivePayment(req, res);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/app.js' || url.pathname === '/styles.css')) {
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const content = await fs.readFile(path.join(__dirname, 'public', file));
      res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(content);
    }
    return json(res, 404, { error: 'Not found.' });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
}).listen(PORT, () => console.log(`Aster Audio Backend listening on ${PORT}`));
