// netlify/functions/attachStripe.js
const Stripe = require('stripe');

/**
 * Helper to wrap a response with CORS headers.
 */
function corsResponse(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(bodyObj)
  };
}

exports.handler = async (event, context) => {
  // 1) Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return corsResponse(200, {});
  }

  // 2) Only allow POST
  if (event.httpMethod !== 'POST') {
    return corsResponse(405, { error: 'Method Not Allowed. Use POST.' });
  }

  // 3) Parse request body
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return corsResponse(400, { error: 'Invalid JSON in request body.' });
  }

  const { customerId, paymentMethodId } = body;
  if (!customerId || !paymentMethodId) {
    return corsResponse(400, { error: 'Missing customerId or paymentMethodId.' });
  }

  // 4) Init Stripe
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return corsResponse(500, { error: 'Stripe Secret Key not set in Netlify env.' });
  }
  const stripe = Stripe(stripeKey);

  try {
    // 5) Attach the PaymentMethod to the existing customer
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });

    // 6) Set as default payment method for the customer
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId }
    });

    // 7) Retrieve the updated PaymentMethod to get last4
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    const last4 = paymentMethod.card?.last4 || null;

    return corsResponse(200, {
      success: true,
      last4
    });

  } catch (error) {
    let errorMessage = error.message || 'Error attaching payment method.';
    if (error.raw && error.raw.message) {
      errorMessage = error.raw.message;
    }
    return corsResponse(500, { success: false, error: errorMessage });
  }
};
