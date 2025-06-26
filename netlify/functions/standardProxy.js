// Netlify Function: gasProxy.js
// -----------------------------------------------------------------------------
// This function acts as a CORS‑friendly proxy between front‑end clients and a
// Google Apps Script (GAS) Web App.
//
//   POST /.netlify/functions/gasProxy?url=<GAS_WEB_APP_URL>[&param=value...]
//   Body: JSON (any serialisable payload) – forwarded unchanged to GAS.
//
// It forwards the JSON payload to the GAS URL **and automatically appends any
// extra query‑string parameters** it receives (besides `url`) so you can send
// arbitrary parameters to your script without CORS headaches.
// -----------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  // Handle CORS pre‑flight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: "Method not allowed. Use POST.",
    };
  }

  // Extract the target GAS URL and any additional parameters
  const { url, ...otherParams } = event.queryStringParameters || {};

  if (!url) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Missing 'url' query parameter." }),
    };
  }

  // Build the target URL, appending any extra parameters so callers can do
  //   /.netlify/functions/gasProxy?url=<script>&foo=bar&baz=qux
  // which becomes  <script>?foo=bar&baz=qux on the GAS side.
  const targetUrl = new URL(url);
  Object.entries(otherParams).forEach(([key, value]) => {
    targetUrl.searchParams.append(key, value);
  });

  try {
    const gasResponse = await fetch(targetUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: event.body || "{}",
      redirect: "follow",
    });

    const responseBody = await gasResponse.text();

    return {
      statusCode: gasResponse.status,
      headers: {
        ...corsHeaders,
        "Content-Type": gasResponse.headers.get("Content-Type") || "text/plain",
      },
      body: responseBody,
    };
  } catch (error) {
    console.error("Error proxying request to GAS:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Proxy request failed", details: error.message }),
    };
  }
};

