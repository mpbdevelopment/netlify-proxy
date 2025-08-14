// netlify/functions/create-payment-intent.js
const Stripe = require('stripe');

// Set STRIPE_SECRET_KEY in your Netlify environment variables
// (Dashboard → Site settings → Environment variables)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

// Adjust this to your site origin if you want to lock down CORS
const ALLOW_ORIGIN = process.env.CORS_ALLOW_ORIGIN || '*';

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': ALLOW_ORIGIN,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': ALLOW_ORIGIN },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { amount, currency = 'usd' } = JSON.parse(event.body || '{}');

    // Basic validation
    if (!Number.isInteger(amount) || amount < 50) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': ALLOW_ORIGIN },
        body: JSON.stringify({ error: 'Invalid amount (minimum $0.50)' }),
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount, // in cents
        currency,
        // This enables cards + wallets (Apple Pay/Google Pay will appear via Elements)
        automatic_payment_methods: { enabled: true },
        metadata: { purpose: 'donation' },
      },
      // (Optional) idempotency to protect against double-clicks
      { idempotencyKey: `pi_${amount}_${Date.now()}` }
    );

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': ALLOW_ORIGIN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': ALLOW_ORIGIN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
