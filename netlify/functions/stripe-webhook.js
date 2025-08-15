// netlify/functions/stripe-webhook.js
const Stripe = require('stripe');
const fetch = require('node-fetch');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

// The URL of your deployed Google Apps Script Web App
const GAS_WEBAPP_URL = process.env.GAS_WEBAPP_URL;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let stripeEvent;
  try {
    // No signature verification — Stripe will send JSON
    stripeEvent = JSON.parse(event.body);
  } catch (err) {
    console.error('Invalid JSON from Stripe', err);
    return { statusCode: 400, body: 'Invalid payload' };
  }

  if (stripeEvent.type === 'payment_intent.succeeded') {
    const pi = stripeEvent.data.object;
    const charge = pi.charges?.data?.[0];

    const name = charge?.billing_details?.name || null;
    const email = charge?.billing_details?.email || null;

    const payload = {
      paymentIntentId: pi.id,
      chargeId: charge?.id || null,
      amount: pi.amount_received ?? pi.amount,
      currency: pi.currency,
      status: pi.status,
      name,
      email,
      statementDescriptor: charge?.statement_descriptor || null,
      created: charge?.created || pi.created,
      metadata: pi.metadata || {},
    };

    try {
      const res = await fetch(GAS_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('GAS error:', text);
        return { statusCode: 500, body: 'GAS logging failed' };
      }
    } catch (err) {
      console.error('Error posting to GAS:', err);
      return { statusCode: 500, body: 'Server error' };
    }
  }

  return { statusCode: 200, body: 'ok' };
};
