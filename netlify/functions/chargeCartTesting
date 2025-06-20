// netlify/functions/chargeCart.js
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

  const { email, amount } = body; 
  // amount in cents (e.g., 500 => $5.00)
  if (!email || !amount) {
    return corsResponse(400, { error: 'Missing email or amount.' });
  }

  // 4) Init Stripe
  const stripeKey = process.env.STRIPE_TEST_KEY;
  if (!stripeKey) {
    return corsResponse(500, { error: 'Stripe Secret Key not set in Netlify env.' });
  }
  const stripe = Stripe(stripeKey);

  try {
    // 5) Search for the Stripe customer by email
    //    We find the default payment method from invoice_settings
    const customerResp = await stripe.customers.search({
      query: `email:"${email}"`,
      limit: 1
    });
    if (!customerResp.data || customerResp.data.length === 0) {
      return corsResponse(200, { success: false, error: 'No Stripe customer found for that email.' });
    }
    const customer = customerResp.data[0];

    // 6) Off-session Payment Intent with default payment method
    const defaultPM = customer.invoice_settings.default_payment_method;
    if (!defaultPM) {
      return corsResponse(200, { success: false, error: 'No default payment method found for this customer.' });
    }

    // 7) Create a Payment Intent for the total cart amount (in cents)
    //    confirm=true => immediate attempt
    //    off_session=true => no user action required
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,               // e.g., 500 means $5.00
      currency: 'usd',             // or your currency
      customer: customer.id,
      payment_method: defaultPM,
      off_session: true,
      confirm: true
    });

    // If confirm succeeded => status= 'succeeded' or 'requires_...' in some cases
    if (paymentIntent.status === 'succeeded') {
      // Payment successful
      return corsResponse(200, { success: true });
    } else {
      // Possibly requires user action => we treat as an error in your flow
      return corsResponse(200, { success: false, error: 'Payment not succeeded. Status=' + paymentIntent.status });
    }

  } catch (err) {
    // If the PaymentIntent fails for any reason => show error
    return corsResponse(500, { success: false, error: err.message });
  }
};

// Helper for consistent CORS
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
