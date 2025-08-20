// netlify/functions/create-payment-intent-donate.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_DONATE);

exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: 'OK',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { amount, coverFee = false, recurring = false, interval } = JSON.parse(event.body || '{}');

    // ---- Validate & compute in cents (integer math) ----
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars < 1) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Invalid amount. Minimum $1.' }),
      };
    }
    const baseCents = Math.round(dollars * 100);
    const feeCents = coverFee ? Math.round(baseCents * 3 / 100) : 0;
    const unitAmount = baseCents + feeCents;

    const isSubscription = !!recurring && (interval === 'year' || interval === 'month' || interval === 'week' || interval === 'day');
    const recurInterval = interval || 'year';

    // Common Checkout options (hosted page handles Apple Pay/Google Pay/Link automatically)
    const common = {
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      success_url: 'https://www.thepaddleproject.org/?checkout=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://www.thepaddleproject.org/?checkout=cancel',
      // Don’t pin payment_method_types so Stripe can include wallets as appropriate.
      // automatic_tax: { enabled: false }, // enable if needed later
    };

    let session;

    if (!isSubscription) {
      // ---------- ONE-TIME ----------
      session = await stripe.checkout.sessions.create({
        ...common,
        mode: 'payment',
        customer_creation: 'always', // ensures you get a Customer w/ email/name
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: unitAmount,
            product_data: { name: 'Donation' },
          },
          quantity: 1,
        }],
        // Put metadata on the resulting PaymentIntent (visible in webhook)
        payment_intent_data: {
          metadata: {
            donationType: 'one_time',
            coverFee: coverFee ? 'true' : 'false',
            baseAmount: String(baseCents),
            finalAmount: String(unitAmount),
          },
        },
      });
    } else {
      // ---------- RECURRING ----------
      session = await stripe.checkout.sessions.create({
        ...common,
        mode: 'subscription',
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: unitAmount,
            recurring: { interval: recurInterval },
            product_data: { name: `Donation (${recurInterval})` },
          },
          quantity: 1,
        }],
        // Put metadata on the Subscription (and first invoice/PI will inherit context)
        subscription_data: {
          metadata: {
            donationType: `recurring_${recurInterval}`,
            coverFee: coverFee ? 'true' : 'false',
            baseAmount: String(baseCents),
            finalAmount: String(unitAmount),
          },
        },
      });
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe error:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Server error.' }),
    };
  }
};
