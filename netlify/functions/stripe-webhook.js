// netlify/functions/stripe-webhook.js
// -------------------------------------------------------------
// Stripe -> Netlify (this function) -> Google Apps Script WebApp
// Logs successful donations/subscriptions to your Google Sheet.
// No signature verification used (per your request).
// -------------------------------------------------------------

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_DONATE, { apiVersion: '2024-06-20' });

// Your deployed Apps Script Web App URL (that appends to the Sheet)
const GAS_WEBAPP_URL = process.env.GAS_WEBAPP_URL;

// Prefer native fetch (Node 18+ on Netlify). Fallback to node-fetch if needed.
async function doFetch(url, options) {
  if (typeof fetch === 'function') return fetch(url, options);
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch(url, options);
}

// --- Helpers --------------------------------------------------

function pickNameEmail({ charge, paymentMethod, customer, receiptEmail }) {
  const name =
    charge?.billing_details?.name ||
    paymentMethod?.billing_details?.name ||
    customer?.name || null;

  const email =
    charge?.billing_details?.email ||
    paymentMethod?.billing_details?.email ||
    customer?.email ||
    receiptEmail || null;

  return { name, email };
}

function cents(n) {
  return Number.isFinite(n) ? n : null;
}

async function postToGAS(payload) {
  const res = await doFetch(GAS_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GAS logging failed: ${res.status} ${txt}`);
  }
}

// --- Handlers for specific Stripe events ---------------------

// 1) payment_intent.succeeded — covers one-time payments and also first invoice on subs
async function handlePaymentIntentSucceeded(rawPi) {
  // Re-fetch to expand related objects for reliable identity capture
  const pi = await stripe.paymentIntents.retrieve(rawPi.id, {
    expand: ['customer', 'charges.data.payment_method'],
  });

  const charge = pi.charges?.data?.[0] || null;
  const paymentMethod = charge?.payment_method || null;
  const customer = pi.customer || null; // expanded object (if present)

  const { name, email } = pickNameEmail({
    charge,
    paymentMethod,
    customer,
    receiptEmail: pi.receipt_email,
  });

  const payload = {
    source: 'payment_intent.succeeded',
    isSubscription: Boolean(pi.invoice),       // true if created by an invoice
    paymentIntentId: pi.id,
    chargeId: charge?.id || null,
    customerId: (typeof customer === 'object' && customer?.id) || (typeof pi.customer === 'string' ? pi.customer : null),
    subscriptionId: rawPi.invoice ? rawPi.invoice.subscription || null : null,
    amount: cents(pi.amount_received ?? pi.amount), // cents
    currency: pi.currency,
    status: pi.status,
    name,
    email,
    created: charge?.created || pi.created,    // unix seconds
    metadata: pi.metadata || {},
  };

  await postToGAS(payload);
}

// 2) checkout.session.completed — useful fallback; has amount_total & customer
async function handleCheckoutSessionCompleted(rawSession) {
  // Expand to access PI/Customer/Subscription if present
  const session = await stripe.checkout.sessions.retrieve(rawSession.id, {
    expand: ['payment_intent.charges.data.payment_method', 'customer', 'subscription'],
  });

  const pi = session.payment_intent && typeof session.payment_intent === 'object'
    ? session.payment_intent
    : null;
  const charge = pi?.charges?.data?.[0] || null;
  const paymentMethod = charge?.payment_method || null;
  const customer = session.customer || null;

  const { name, email } = pickNameEmail({
    charge,
    paymentMethod,
    customer,
    receiptEmail: session.customer_details?.email || session.customer_email,
  });

  const payload = {
    source: 'checkout.session.completed',
    isSubscription: session.mode === 'subscription',
    paymentIntentId: pi?.id || null,
    chargeId: charge?.id || null,
    customerId: (typeof customer === 'object' && customer?.id) || (typeof session.customer === 'string' ? session.customer : null),
    subscriptionId: (typeof session.subscription === 'object' && session.subscription?.id) || (typeof session.subscription === 'string' ? session.subscription : null),
    amount: cents(session.amount_total ?? pi?.amount_received ?? pi?.amount), // cents
    currency: session.currency || pi?.currency || null,
    status: pi?.status || session.payment_status || null,
    name,
    email,
    created: charge?.created || pi?.created || session.created, // unix seconds
    metadata: (pi?.metadata && Object.keys(pi.metadata).length ? pi.metadata : session.metadata) || {},
  };

  await postToGAS(payload);
}

// 3) invoice.payment_succeeded — subscription renewals (no Checkout session)
async function handleInvoicePaymentSucceeded(rawInvoice) {
  // Expand to access customer & payment_intent & subscription
  const invoice = await stripe.invoices.retrieve(rawInvoice.id, {
    expand: ['customer', 'payment_intent.charges.data.payment_method', 'subscription'],
  });

  const pi = invoice.payment_intent && typeof invoice.payment_intent === 'object'
    ? invoice.payment_intent
    : null;
  const charge = pi?.charges?.data?.[0] || null;
  const paymentMethod = charge?.payment_method || null;
  const customer = invoice.customer || null;

  const { name, email } = pickNameEmail({
    charge,
    paymentMethod,
    customer,
    receiptEmail: invoice.customer_email,
  });

  const payload = {
    source: 'invoice.payment_succeeded',
    isSubscription: true,
    paymentIntentId: pi?.id || null,
    chargeId: charge?.id || null,
    customerId: (typeof customer === 'object' && customer?.id) || (typeof invoice.customer === 'string' ? invoice.customer : null),
    subscriptionId: (typeof invoice.subscription === 'object' && invoice.subscription?.id) || (typeof invoice.subscription === 'string' ? invoice.subscription : null),
    amount: cents(invoice.amount_paid), // cents
    currency: invoice.currency,
    status: pi?.status || 'succeeded',
    name,
    email,
    created: invoice.status_transitions?.paid_at || invoice.created, // unix seconds
    metadata: (pi?.metadata && Object.keys(pi.metadata).length ? pi.metadata : invoice.metadata) || {},
  };

  await postToGAS(payload);
}

// --- Netlify handler -----------------------------------------

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    // We’re not verifying signatures, so plain JSON parse is fine.
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    console.error('Invalid JSON', e);
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const type = body?.type;
  if (!type || !body?.data?.object) {
    return { statusCode: 400, body: 'Invalid event' };
  }

  try {
    switch (type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(body.data.object);
        break;

      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(body.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(body.data.object);
        break;

      default:
        // Ignore other events
        break;
    }
  } catch (err) {
    console.error(`Handler error for ${type}:`, err);
    // Return 500 so Stripe retries if GAS or network hiccups occur
    return { statusCode: 500, body: 'Error processing event' };
  }

  // Acknowledge receipt
  return { statusCode: 200, body: 'ok' };
};

