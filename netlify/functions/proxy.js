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

  // Replace with your real Google Apps Script web app URL
  // (the part before any ?query=…)
  const GAS_BASE_URL = 'https://script.google.com/macros/s/AKfycbxykDL5ZqN8LUteCF_tsUjSebRd0mnpgOBGkNnkK1--qd6Yeq-3sdDZvXB-3NWQODLhhQ/exec';

  try {
    // 2) Construct the final URL including any query parameters
    //    from the Netlify function event.

    // If the user hits e.g. ?action=getPlayerInfo&email=jane@example.com,
    // Netlify provides them as event.queryStringParameters
    const params = new URLSearchParams(event.queryStringParameters).toString();

    // Combine base URL + query string
    // e.g. "https://script.google.com/macros/s/XYZ/exec?action=getPlayerInfo&email=jane@example.com"
    const gasUrl = params
      ? `${GAS_BASE_URL}?${params}`
      : GAS_BASE_URL;

    // 3) Prepare fetch options
    const fetchOptions = {
      method: event.httpMethod, // GET or POST
      headers: { 'Content-Type': 'application/json' }
    };

    // If it's POST, forward the request body
    if (event.httpMethod === 'POST') {
      fetchOptions.body = event.body; 
      // event.body is the raw JSON string from the client
    }

    // 4) Server-to-server request to Google Apps Script
    const response = await fetch(gasUrl, fetchOptions);
    const text = await response.text(); // or response.json() if guaranteed JSON

    // 5) Return the response to the front-end with CORS headers
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: text
    };

  } catch (err) {
    // On error, also set CORS
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: err.message })
    };
  }
};
