// netlify/functions/create-payment-intent-donate.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_DONATE);

exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Consider restricting to your domain
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
      recurring = false,
      interval = undefined, // 'year' when recurring
      // Optional passthroughs you might add later:
      // email, name, metadata = {}
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

    // ---- Calculate final amount (with optional 3% fee cover) ----
    let finalAmount = parsedAmount;
    if (coverFee) finalAmount *= 1.03;
    const unitAmount = Math.round(finalAmount * 100); // cents

    // ---- Determine mode & line item ----
    const isSubscription = !!recurring && (interval === 'year'); // Only support yearly subs
    const mode = isSubscription ? 'subscription' : 'payment';

    const lineItem = isSubscription
      ? {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Yearly Donation',
            },
            unit_amount: unitAmount,
            recurring: { interval: 'year' },
          },
          quantity: 1,
        }
      : {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Donation',
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        };

    // ---- Create Checkout Session ----
    const session = await stripe.checkout.sessions.create({
      mode,
      payment_method_types: ['card'],
      line_items: [lineItem],

      // Optional quality-of-life settings:
      customer_creation: 'if_required', // lets Stripe create/reuse a Customer
      allow_promotion_codes: true,
      billing_address_collection: 'auto',

      // Success/Cancel
      success_url: 'https://www.thepaddleproject.org/?checkout=success',
      cancel_url: 'https://www.thepaddleproject.org/?checkout=cancel',

      // Useful tags for dashboards & webhooks
      metadata: {
        donationType: isSubscription ? 'recurring_yearly' : 'one_time',
        coverFee: coverFee ? 'true' : 'false',
        baseAmount: String(Math.round(parsedAmount * 100)), // cents before fee cover
        finalAmount: String(unitAmount), // cents after fee cover
      },
    });

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

