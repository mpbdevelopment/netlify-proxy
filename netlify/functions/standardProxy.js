//This proxy serves the standard signup form with the active session links from MP Player Database 2, Session Links.

// netlify/functions/standardProxy.js
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // 1) Handle OPTIONS requests for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  // 2) Base Apps Script URL for this implementation.
  // Replace with your GAS project's URL.
  const GAS_BASE_URL = 'https://script.google.com/macros/s/AKfycbx3V8rnrRZKpAVPszdWRjx5qDCJe1I6YIeG84JqGxGarJ9srIzTvhZX81UF0G01d7Py-g/exec';

  try {
    // 3) Construct the final URL including any query parameters
    const params = new URLSearchParams(event.queryStringParameters).toString();
    const gasUrl = params ? `${GAS_BASE_URL}?${params}` : GAS_BASE_URL;

    // 4) Prepare fetch options based on the incoming request
    const fetchOptions = {
      method: event.httpMethod,
      headers: {}
    };

    // If it's a POST request, forward the JSON body and set the header accordingly.
    if (event.httpMethod === 'POST') {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = event.body; // Forward the raw JSON string
    }

    // 5) Forward the request to the GAS endpoint
    const response = await fetch(gasUrl, fetchOptions);
    const text = await response.text(); // Use text() to capture the response

    // 6) Return the final response with the necessary CORS headers
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: text
    };

  } catch (err) {
    // On error, return a 500 with CORS headers
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ error: err.message })
    };
  }
};
