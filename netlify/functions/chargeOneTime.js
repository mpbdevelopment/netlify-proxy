// netlify/functions/chargeOneTime.js
const Stripe = require('stripe');

exports.handler = async (event, context) => {
  // 1) Handle OPTIONS for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: ''
    };
  }

  // 2) Only allow POST
  if (event.httpMethod !== 'POST') {
    return corsResponse(405, { error: 'Method Not Allowed. Use POST.' });
  }

  // 3) Parse request body
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return corsResponse(400, { error: 'Invalid JSON in request body.' });
  }

  const { amount, paymentMethodId, transferAmounts } = body;
  if (!amount || !paymentMethodId) {
    return corsResponse(400, { error: 'Missing amount or paymentMethodId.' });
  }

  // 4) Init Stripe with Secret Key
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return corsResponse(500, { error: 'Stripe Secret Key not set in Netlify env.' });
  }
  const stripe = Stripe(stripeKey);

  // 5) Parse and validate transfer inputs against env
  const {
    connectedAccountIds,
    parsedTransferAmounts,
    totalTransferAmount,
    validationError
  } = parseAndValidateTransfers(transferAmounts);

  if (validationError) {
    return corsResponse(400, { error: validationError });
  }

  if (totalTransferAmount > amount) {
    return corsResponse(400, { error: 'Sum of transferAmounts cannot exceed total amount.' });
  }

  try {
    // We create the PaymentIntent (client will confirm). We attach the split info as metadata
    // and a transfer_group so your webhook can create transfers on payment_intent.succeeded.
    const orderId = `order_${Date.now()}`;
    const splits = makeSplitsJSON(connectedAccountIds, parsedTransferAmounts);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,        // e.g., 500 for $5
      currency: 'usd',
      payment_method: paymentMethodId,
      confirm: false,         // client will confirm with stripe.confirmCardPayment
      transfer_group: orderId,
      metadata: {
        splits_json: JSON.stringify(splits),
        total_transfer_amount: String(totalTransferAmount)
      }
      // Optionally add a receipt_email if you want automatic Stripe receipt:
      // receipt_email: userEmail
    });

    // Return the client_secret to confirm client-side, plus transfer context
    return corsResponse(200, {
      success: true,
      clientSecret: paymentIntent.client_secret,
      transferGroup: orderId,
      // Including the split back so the client can display/verify if needed
      splits
    });
  } catch (err) {
    return corsResponse(500, { success: false, error: err.message });
  }
};

// Helpers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function corsResponse(statusCode, bodyObj) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(bodyObj)
  };
}

function parseAndValidateTransfers(transferAmounts) {
  const connectedIdsEnv = process.env.CONNECTED_ACCOUNT_IDS || '';
  const connectedAccountIds = connectedIdsEnv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // If no transferAmounts provided, treat as zero transfers.
  if (!transferAmounts || !Array.isArray(transferAmounts) || transferAmounts.length === 0) {
    return {
      connectedAccountIds,
      parsedTransferAmounts: [],
      totalTransferAmount: 0,
      validationError: null
    };
  }

  // Validate format
  const parsed = [];
  for (const a of transferAmounts) {
    const n = Number(a);
    if (!Number.isInteger(n) || n < 0) {
      return {
        connectedAccountIds,
        parsedTransferAmounts: [],
        totalTransferAmount: 0,
        validationError: 'transferAmounts must be an array of non-negative integers (cents).'
      };
    }
    parsed.push(n);
  }

  if (connectedAccountIds.length === 0) {
    return {
      connectedAccountIds,
      parsedTransferAmounts: [],
      totalTransferAmount: 0,
      validationError: 'CONNECTED_ACCOUNT_IDS env var is empty or missing.'
    };
  }

  if (parsed.length !== connectedAccountIds.length) {
    return {
      connectedAccountIds,
      parsedTransferAmounts: [],
      totalTransferAmount: 0,
      validationError: `transferAmounts length (${parsed.length}) must match number of CONNECTED_ACCOUNT_IDS (${connectedAccountIds.length}).`
    };
  }

  const total = parsed.reduce((sum, n) => sum + n, 0);

  return {
    connectedAccountIds,
    parsedTransferAmounts: parsed,
    totalTransferAmount: total,
    validationError: null
  };
}

function makeSplitsJSON(connectedAccountIds, amounts) {
  if (!connectedAccountIds || !amounts || connectedAccountIds.length !== amounts.length) return [];
  return connectedAccountIds.map((acct, i) => ({
    destination_account: acct,
    amount: amounts[i]
  }));
}
