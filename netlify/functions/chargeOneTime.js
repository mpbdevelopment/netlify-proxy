// netlify/functions/chargeOneTime.js
const Stripe = require('stripe');

exports.handler = async (event, context) => {
  // 1) Handle OPTIONS for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
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

  const { amount, paymentMethodId } = body;
  if (!amount || !paymentMethodId) {
    return corsResponse(400, { error: 'Missing amount or paymentMethodId.' });
  }

  // 4) Init Stripe with Secret Key
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return corsResponse(500, { error: 'Stripe Secret Key not set in Netlify env.' });
  }
  const stripe = Stripe(stripeKey);

  try {
    // 5) Create PaymentIntent with confirm=false
    //    We'll confirm on the client (with stripe.confirmCardPayment).
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,             // e.g. 500 for $5
      currency: 'usd',
      payment_method: paymentMethodId,
      confirm: false,               // do not confirm here
      // Optionally add a receipt_email if you want automatic Stripe receipt:
      // receipt_email: userEmail
    });

    // 6) Return the client_secret to confirm client-side
    return corsResponse(200, {
      success: true,
      clientSecret: paymentIntent.client_secret
    });
  } catch (err) {
    return corsResponse(500, { success: false, error: err.message });
  }
};

// Helper
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
