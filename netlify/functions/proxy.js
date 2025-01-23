// netlify/functions/proxy.js
const fetch = require('node-fetch'); // If you need node-fetch

exports.handler = async (event, context) => {
  // Handle OPTIONS for CORS preflight
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

  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxykDL5ZqN8LUteCF_tsUjSebRd0mnpgOBGkNnkK1--qd6Yeq-3sdDZvXB-3NWQODLhhQ/exec';

  try {
    const fetchOptions = {
      method: event.httpMethod,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (event.httpMethod === 'POST') {
      fetchOptions.body = event.body; // event.body is a string from the client
    }

    const response = await fetch(APPS_SCRIPT_URL, fetchOptions);
    const resultText = await response.text(); // or response.json() if you know it's JSON

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: resultText
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
