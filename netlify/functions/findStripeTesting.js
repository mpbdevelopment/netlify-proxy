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
 * - If no default payment method is set, attempts to find ANY card PM on file 
 *   and sets it as the default, then uses that for last4.
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
  const stripeKey = process.env.STRIPE_TEST_KEY;
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

    if (response.status !== 200) {
      // Some Stripe error
      return corsResponse(response.status, { success: false, error: result });
    }

    // If we get here, status was 200
    if (!result.data || result.data.length === 0) {
      // No customer found
      return corsResponse(200, { success: true, exists: false });
    }

    // We have a customer
    let customer = result.data[0];
    let cardLast4 = null;

    // Check if there's a default payment method
    let defaultPM = customer.invoice_settings?.default_payment_method;

    // 2) If no default PM, try to find ANY card and set it as default
    if (!defaultPM) {
      const pmListUrl = `https://api.stripe.com/v1/payment_methods?customer=${customer.id}&type=card`;
      const pmListResp = await fetch(pmListUrl, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + stripeKey }
      });
      if (pmListResp.status === 200) {
        const pmListData = await pmListResp.json();
        if (pmListData.data && pmListData.data.length > 0) {
          // pick the first card
          const firstCardPM = pmListData.data[0];
          defaultPM = firstCardPM.id;

          // 3) Update the customer to set this as default
          const updateUrl = `https://api.stripe.com/v1/customers/${customer.id}`;
          const updateResp = await fetch(updateUrl, {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + stripeKey,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              'invoice_settings[default_payment_method]': defaultPM
            }).toString()
          });

          if (updateResp.status === 200) {
            // The customer is updated, so let's set cardLast4 from this PM
            // We already have the 'firstCardPM' from the list
            if (firstCardPM.card && firstCardPM.card.last4) {
              cardLast4 = firstCardPM.card.last4;
            }
            // Optionally, re-fetch the updated customer if you need the new data
            // For now, we won't since we only need last4
          }
        }
      }
    }

    // 4) If we still don't have a default PM (or it's there but we haven't retrieved last4),
    //    let's do the original logic: retrieve that PaymentMethod if it exists
    if (defaultPM && !cardLast4) {
      const pmUrl = `https://api.stripe.com/v1/payment_methods/${defaultPM}`;
      const pmResp = await fetch(pmUrl, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + stripeKey }
      });
      if (pmResp.status === 200) {
        const pmData = await pmResp.json();
        if (pmData.card && pmData.card.last4) {
          cardLast4 = pmData.card.last4;
        }
      }
    }

    // Return success + cardLast4 if we have it
    return corsResponse(200, {
      success: true,
      exists: true,
      customer,
      cardLast4 // may be null if no PM found
    });

  } catch (err) {
    // Net or other error
    return corsResponse(500, { success: false, error: err.message });
  }
};
