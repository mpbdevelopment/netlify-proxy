// netlify/functions/findStripe.js
const fetch = require('node-fetch');

/**
 * Helper to wrap a response with CORS headers.
 */
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

/**
 * Main handler function: findStripe
 * - Expects ?email=user@example.com
 * - Searches Stripe for a customer with that email
 * - If found, tries to retrieve the default payment method to get last4.
 */
exports.handler = async (event, context) => {
  // Handle OPTIONS (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return corsResponse(200, {});
  }

  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return corsResponse(405, { error: 'Method Not Allowed. Use GET.' });
  }

  // Parse query params
  const queryParams = new URLSearchParams(event.queryStringParameters);
  const email = queryParams.get('email');
  if (!email) {
    return corsResponse(400, { error: 'No email provided.' });
  }

  // Get Stripe secret key from environment
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return corsResponse(500, { error: 'Stripe Secret Key not set in Netlify env.' });
  }

  try {
    // 1) Search Stripe for a customer
    const url = 'https://api.stripe.com/v1/customers/search';
    const query = `email:"${email}"`;
    const fullUrl = `${url}?query=${encodeURIComponent(query)}&limit=1`;

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + stripeKey
      }
    });

    const result = await response.json();

    if (response.status === 200) {
      if (result.data && result.data.length > 0) {
        const customer = result.data[0];
        // Customer found
        let cardLast4 = null;

        // 2) Check if there's a default payment method
        const defaultPM = customer.invoice_settings?.default_payment_method;
        if (defaultPM) {
          // 3) Retrieve that PaymentMethod to get the card info
          const pmUrl = `https://api.stripe.com/v1/payment_methods/${defaultPM}`;
          const pmResp = await fetch(pmUrl, {
            method: 'GET',
            headers: { Authorization: 'Bearer ' + stripeKey }
          });
          if (pmResp.status === 200) {
            const pmData = await pmResp.json();
            // pmData.card should have brand, last4, etc.
            if (pmData.card && pmData.card.last4) {
              cardLast4 = pmData.card.last4;
            }
          }
        }

        return corsResponse(200, {
          success: true,
          exists: true,
          customer,  // optional to keep the entire customer object
          cardLast4  // new property for front-end usage
        });
      } else {
        // No customer found
        return corsResponse(200, { success: true, exists: false });
      }
    } else {
      // Some Stripe error
      return corsResponse(response.status, { success: false, error: result });
    }

  } catch (err) {
    // Net or other error
    return corsResponse(500, { success: false, error: err.message });
  }
};
