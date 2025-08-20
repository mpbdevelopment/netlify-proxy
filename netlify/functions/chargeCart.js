// netlify/functions/chargeCart.js
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

  const { email, amount, transferAmounts } = body; // transferAmounts: array of integers (cents)
  if (!email || !amount) {
    return corsResponse(400, { error: 'Missing email or amount.' });
  }

  // 4) Init Stripe
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

  // 6) Proceed
  try {
    // Find the Stripe customer by email
    const customerResp = await stripe.customers.search({
      query: `email:"${email}"`,
      limit: 1
    });
    if (!customerResp.data || customerResp.data.length === 0) {
      return corsResponse(200, { success: false, error: 'No Stripe customer found for that email.' });
    }
    const customer = customerResp.data[0];

    // Get customer's default payment method
    const defaultPM = customer.invoice_settings?.default_payment_method;
    if (!defaultPM) {
      return corsResponse(200, { success: false, error: 'No default payment method found for this customer.' });
    }

    // Create a PaymentIntent for the total amount
    const orderId = `order_${Date.now()}`;
    const splits = makeSplitsJSON(connectedAccountIds, parsedTransferAmounts);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,      // e.g., 500 means $5.00
      currency: 'usd',
      customer: customer.id,
      payment_method: defaultPM,
      off_session: true,
      confirm: true,
      transfer_group: orderId,
      metadata: {
        // stash split details so webhooks/reporting can inspect later
        splits_json: JSON.stringify(splits),
        total_transfer_amount: String(totalTransferAmount)
      }
    });

    if (paymentIntent.status !== 'succeeded') {
      return corsResponse(200, { success: false, error: 'Payment not succeeded. Status=' + paymentIntent.status });
    }

    // 7) Create transfers immediately (optional but convenient here since we already confirmed)
    const chargeId = paymentIntent.latest_charge;
    const createdTransfers = [];
    const transferErrors = [];

    if (totalTransferAmount > 0) {
      for (let i = 0; i < parsedTransferAmounts.length; i++) {
        const amt = parsedTransferAmounts[i];
        const dest = connectedAccountIds[i];
        if (amt > 0) {
          try {
            const tr = await stripe.transfers.create({
              amount: amt,
              currency: paymentIntent.currency,
              destination: dest,
              transfer_group: orderId,
              source_transaction: chargeId,
              description: `Split ${i + 1}/${parsedTransferAmounts.length} for ${orderId}`
            }, { idempotencyKey: `tr_${paymentIntent.id}_${i}` });
            createdTransfers.push({ id: tr.id, amount: tr.amount, destination: tr.destination });
          } catch (err) {
            transferErrors.push({ destination: dest, amount: amt, error: err.message });
          }
        }
      }
    }

    const platformRetainedAmount = amount - totalTransferAmount;

    // 8) Response
    return corsResponse(200, {
      success: true,
      paymentIntentId: paymentIntent.id,
      transferGroup: orderId,
      chargeId,
      transfersCreated: createdTransfers,
      transferErrors,
      platformRetainedAmount
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
