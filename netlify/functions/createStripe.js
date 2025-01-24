// netlify/functions/createStripe.js
const fetch = require('node-fetch');
const Stripe = require('stripe');

/**
 * Helper to wrap a response with CORS headers
 */
function corsResponse(status, bodyObj) {
  return {
    statusCode: status,
    headers: {
      'Access-Control-Allow-Origin': '*', // Allow all origins
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: JSON.stringify(bodyObj)
  };
}

/**
 * Main handler function
 */
exports.handler = async (event, context) => {
  // 1) Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return corsResponse(200, {});
  }

  // 2) Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return corsResponse(405, { error: 'Method Not Allowed. Use POST.' });
  }

  // 3) Parse and validate the request body
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return corsResponse(400, { error: 'Invalid JSON in request body.' });
  }

  const { name, email, paymentMethodId } = body;

  if (!name || !email || !paymentMethodId) {
    return corsResponse(400, { error: 'Missing required fields: name, email, paymentMethodId.' });
  }

  // 4) Initialize Stripe with the secret key from environment variables
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return corsResponse(500, { error: 'Stripe Secret Key not configured.' });
  }

  const stripe = Stripe(stripeSecretKey);

  try {
    // 5) Create a new customer in Stripe
    const customer = await stripe.customers.create({
      name: name,
      email: email,
      payment_method: paymentMethodId,
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });

    // 6) Optionally, you can attach the PaymentMethod to the Customer
    // (Already set as default above)
    /*
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.id,
    });
    */

    // 7) Return the created customer details (you can customize this as needed)
    return corsResponse(200, {
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        // Add other fields if necessary
      }
    });
  } catch (error) {
    // 8) Handle Stripe errors
    let errorMessage = 'An error occurred while creating the Stripe customer.';
    if (error && error.raw && error.raw.message) {
      errorMessage = error.raw.message;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return corsResponse(500, { success: false, error: errorMessage });
  }
};
