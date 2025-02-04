//This proxy serves the standard signup form with the active session links from MP Player Database 2, Session Links.

// netlify/functions/standardProxy.js
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // 1) Handle OPTIONS requests for CORS preflight.
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept'
      },
      body: ''
    };
  }

  // 2) Base Apps Script URL for this implementation.
  // Replace with your GAS project's URL.
  const GAS_BASE_URL = 'https://script.google.com/macros/s/AKfycbx3V8rnrRZKpAVPszdWRjx5qDCJe1I6YIeG84JqGxGarJ9srIzTvhZX81UF0G01d7Py-g/exec';

  try {
    // 3) Construct final URL including query parameters.
    const params = new URLSearchParams(event.queryStringParameters).toString();
    const gasUrl = params ? `${GAS_BASE_URL}?${params}` : GAS_BASE_URL;

    // 4) Prepare fetch options, adding an Accept header to request JSON.
    const fetchOptions = {
      method: event.httpMethod,
      headers: {
        'Accept': 'application/json'
      }
    };

    // If it's a POST, forward the request body & set the Content-Type header.
    if (event.httpMethod === 'POST') {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = event.body; // raw JSON string
    }

    // 5) Forward the request to the GAS endpoint.
    const response = await fetch(gasUrl, fetchOptions);
    const text = await response.text();

    // 6) If the response starts with '<', it's likely HTML (an error or fallback page).
    if (text.trim().startsWith('<')) {
      console.error("Received HTML instead of JSON from GAS:", text);
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept'
        },
        body: JSON.stringify({
          error: "Invalid response from GAS endpoint",
          details: text
        })
      };
    }

    // 7) Return the GAS response with proper CORS headers.
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept'
      },
      body: text
    };

  } catch (err) {
    // 8) On error, return an error response with CORS headers.
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept'
      },
      body: JSON.stringify({ error: err.message })
    };
  }
};
