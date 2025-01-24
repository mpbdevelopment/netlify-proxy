// netlify/functions/proxy.js
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // 1) Handle OPTIONS for CORS preflight
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

  // Base Apps Script URL (no query string)
  const GAS_BASE_URL = 'https://script.google.com/macros/s/AKfycbxykDL5ZqN8LUteCF_tsUjSebRd0mnpgOBGkNnkK1--qd6Yeq-3sdDZvXB-3NWQODLhhQ/exec';

  try {
    // 2) Construct final URL including query params
    const params = new URLSearchParams(event.queryStringParameters).toString();
    const gasUrl = params
      ? `${GAS_BASE_URL}?${params}`
      : GAS_BASE_URL;

    // 3) Prepare fetch options
    const fetchOptions = {
      method: event.httpMethod,
      headers: {}
    };

    // If it's POST, forward the request body & set JSON header
    if (event.httpMethod === 'POST') {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = event.body; // raw JSON string
    }

    // 4) Forward the request to Apps Script
    const response = await fetch(gasUrl, fetchOptions);
    const text = await response.text(); // or .json() if guaranteed JSON

    // 5) Return final response WITH CORS HEADERS
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        // replicate the same headers from OPTIONS
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: text
    };

  } catch (err) {
    // On error, still set CORS
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
