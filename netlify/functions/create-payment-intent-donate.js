// netlify/functions/create-payment-intent-donate.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_DONATE);

exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // consider restricting to your domain
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
    const payload = JSON.parse(event.body || '{}');
    const {
      amount,
      coverFee = false,
      recurring = false,     // true for yearly
      interval = undefined,  // 'year' when recurring
    } = payload;

    // ---- Validate amount ----
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Invalid amount.' }),
      };
    }

    // ---- Apply optional 3% fee cover ----
    let finalAmount = parsedAmount;
    if (coverFee) finalAmount *= 1.03;
    const unitAmount = Math.round(finalAmount * 100); // cents

    // ---- Mode & line item ----
    const isSubscription = !!recurring && interval === 'year';
    const mode = isSubscription ? 'subscription' : 'payment';

    const lineItem = isSubscription
      ? {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Yearly Donation' },
            unit_amount: unitAmount,
            recurring: { interval: 'year' },
          },
          quantity: 1,
        }
      : {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Donation' },
            unit_amount: unitAmount,
          },
          quantity: 1,
        };

    // ---- Build session params ----
    const sessionParams = {
      mode,
      line_items: [lineItem],
      // Cards by default; include explicitly if you like:
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      success_url: 'https://www.thepaddleproject.org/?checkout=success',
      cancel_url: 'https://www.thepaddleproject.org/?checkout=cancel',
      metadata: {
        donationType: isSubscription ? 'recurring_yearly' : 'one_time',
        coverFee: coverFee ? 'true' : 'false',
        baseAmount: String(Math.round(parsedAmount * 100)),
        finalAmount: String(unitAmount),
      },
    };

    // IMPORTANT: Only add customer_creation for payment mode
    if (!isSubscription) {
      sessionParams.customer_creation = 'if_required';
    }
    // (In subscription mode, Checkout will create/reuse a Customer automatically.) :contentReference[oaicite:1]{index=1}

    const session = await stripe.checkout.sessions.create(sessionParams);

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

