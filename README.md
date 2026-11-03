# Aster Audio Backend

The separate confirmation service for the Aster Audio checkout flow. Beeceptor sends its delayed HTTP Callout here; this service validates the `payment.completed` event, records it in the payment operations dashboard, and sends a confirmation to the Aster Audio checkout service. Beeceptor receives `200` only after the checkout accepts the confirmation.

```text
Aster Audio checkout ── POST /payments ──> Beeceptor
Aster Audio checkout <── 202 processing ─── Beeceptor
Beeceptor ── delayed POST /webhooks/payments ──> Aster Audio Backend
Aster Audio Backend ── POST /api/payment-confirmations ──> Aster Audio checkout
```

The service uses no payment gateway and moves no money. Its dashboard shows the most recent confirmation events held in memory.

## Run locally

Requires Node.js 20 or newer. Start the checkout service with `CONFIRMATION_TOKEN` set, then run this service with the same token:

```powershell
$env:APP_CONFIRMATION_URL = 'http://127.0.0.1:4173/api/payment-confirmations'
$env:CONFIRMATION_TOKEN = '<same-private-token-as-checkout>'
npm start
```

Open `http://127.0.0.1:4174/` for the dashboard. `GET /health` reports whether the checkout URL and token are configured. `GET /api/confirmations` returns the recent in-memory activity. Send a payment event to `POST /webhooks/payments`.

## Deploy to Render

The deployed service is at https://asteraudio-backend.onrender.com/. It uses build command `npm install` and start command `npm start`. Set `APP_CONFIRMATION_URL=https://asteraudio.onrender.com/api/payment-confirmations` and set `CONFIRMATION_TOKEN` to the same private value configured on the Aster Audio service. Beeceptor's HTTP Callout target is `https://asteraudio-backend.onrender.com/webhooks/payments`, with POST and a 2–5 second delay. The immediate `202` response sets `paymentId` to `PAY-{{body 'orderId'}}`; the callout sets it to `PAY-{{oReqBody 'orderId'}}`, using the same incoming order ID for both.

Render's free instances can sleep when idle. Open the backend dashboard before a recording take so the service is awake when Beeceptor sends its delayed callout.

For inbound authentication, optionally set `BEECEPTOR_WEBHOOK_SECRET` here and add the same value as Beeceptor's `X-Demo-Secret` callout header. The backend-to-checkout confirmation always requires `CONFIRMATION_TOKEN`.
