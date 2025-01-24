// netlify/functions/findStripe.js
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // 1) CORS Preflight for OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  // 2) Read email from query params
  const queryParams = new URLSearchParams(event.queryStringParameters);
  const email = queryParams.get('email');
  if (!email) {
    return corsResponse(400, { error: 'No email provided.' });
  }

  // 3) Get Stripe secret key from Netlify env (set in site settings)
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return corsResponse(500, { error: 'Stripe Secret Key not configured.' });
  }

  try {
    // 4) Call Stripe "Search" endpoint
    // Docs: https://stripe.com/docs/api/customers/search
    const url = 'https://api.stripe.com/v1/customers/search';
    const query = `email:"${email}"`;
    const fullUrl = `${url}?query=${encodeURIComponent(query)}&limit=1`;

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + stripeKey
      }
    });
    const result = await response.json();

    if (response.status === 200) {
      // data might be {object: 'list', data: [ { stripeCustomerObject } ], ...}
      if (result.data && result.data.length > 0) {
        // Customer exists
        return corsResponse(200, { success: true, exists: true, customer: result.data[0] });
      } else {
        // No customer found
        return corsResponse(200, { success: true, exists: false });
      }
    } else {
      // Error from Stripe
      return corsResponse(response.status, { success: false, error: result });
    }

  } catch (err) {
    // Net or other error
    return corsResponse(500, { success: false, error: err.message });
  }
};

/** Helper to wrap a response with CORS headers */
function corsResponse(status, bodyObj) {
  return {
    statusCode: status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: JSON.stringify(bodyObj)
  };
}
