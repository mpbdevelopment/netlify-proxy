// beehiiv-proxy.js

// The Node.js fetch API is available in Netlify Functions environments (Node 18+),
// otherwise, you may need to install node-fetch.
// Make sure your Beehiiv API key is stored in the environment variable BEEHIIV_API_KEY
const API_KEY = process.env.BEEHIIV_API_KEY;

// The base URL for the Beehiiv API — update this to reflect the correct endpoint/path as needed.
const BEEHIIV_BASE_URL = 'https://api.beehiiv.com/v2';

exports.handler = async (event, context) => {
  // Set up standard CORS headers. Adjust the Allow-Origin value as needed.
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Check for a missing API key configuration
  if (!API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error: missing Beehiiv API key.' }),
    };
  }

  // Determine which Beehiiv resource (endpoint) to target.
  // You can pass a "resource" parameter via the query string, e.g., ?resource=subscribers.
  const params = event.queryStringParameters || {};
  const resource = params.resource || 'defaultResource'; // Change 'defaultResource' as needed
  // Construct the full Beehiiv API URL.
  const beehiivUrl = `${BEEHIIV_BASE_URL}/${resource}`;

  // Prepare the request payload (if any) from the incoming request.
  let requestBody;
  if (event.httpMethod === 'POST') {
    try {
      requestBody = JSON.parse(event.body);
    } catch (err) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON in request body.' }),
      };
    }
  }

  try {
    // Forward the request to Beehiiv, mirroring the HTTP method received.
    const response = await fetch(beehiivUrl, {
      method: event.httpMethod,
      headers: {
        // Include the Beehiiv API key using Authorization header
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      // Only include the body for POST (or PUT/PATCH) requests
      body: event.httpMethod === 'POST' ? JSON.stringify(requestBody) : undefined,
    });

    // Parse the response from the Beehiiv API.
    const data = await response.json();

    // Return the proxied response, preserving the status code.
    return {
      statusCode: response.status,
      headers,
      body: JSON.stringify(data),
    };
  } catch (error) {
    // Handle any errors that occur during the proxy request.
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
