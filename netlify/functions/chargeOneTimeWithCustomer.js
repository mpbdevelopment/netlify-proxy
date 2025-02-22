// netlify/functions/chargeOneTimeWithCustomer.js
const Stripe = require('stripe');

/**
 * Helper for CORS responses
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
  // 1) Handle OPTIONS (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return corsResponse(200, {});
  }

  // 2) Only allow POST
  if (event.httpMethod !== 'POST') {
    return corsResponse(405, { error: 'Method Not Allowed. Use POST.' });
  }

  // 3) Parse the request body
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return corsResponse(400, { error: 'Invalid JSON in request body.' });
  }

  // 4) Extract required data from the body
  const { amount, paymentMethodId, customerId } = body;
  // For a PaymentIntent tied to a PaymentMethod that belongs to a specific Customer,
  // you must also provide `customer: customerId`.
  // If for some reason you want to allow PaymentMethods not tied to a customer, 
  // you could make `customerId` optional. But in your scenario, it's best to require it.
  if (!amount || !paymentMethodId || !customerId) {
    return corsResponse(400, {
      error: 'Missing required fields: amount, paymentMethodId, or customerId.'
    });
  }

  // 5) Initialize Stripe with your secret key
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return corsResponse(500, { error: 'Stripe Secret Key not set in Netlify env.' });
  }
  const stripe = Stripe(stripeKey);

  try {
    // 6) Create a PaymentIntent with confirm=false
    //    We'll confirm on the client (via stripe.confirmCardPayment).
    const paymentIntent = await stripe.paymentIntents.create({
      amount,                      // e.g. 9900 for $99
      currency: 'usd',
      payment_method: paymentMethodId,
      customer: customerId,        // <--- Critical to match attached PM
      confirm: false,
      // Optionally: receipt_email, description, metadata, etc.
    });

    // 7) Return the clientSecret so the client can confirm the payment
    return corsResponse(200, {
      success: true,
      clientSecret: paymentIntent.client_secret
    });

  } catch (err) {
    return corsResponse(500, { success: false, error: err.message });
  }
};
