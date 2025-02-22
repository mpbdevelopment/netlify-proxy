// setDefaultPaymentMethod.js
const stripePackage = require('stripe');
const admin = require('firebase-admin');

const stripe = stripePackage(process.env.STRIPE_TEST_KEY);

let app;
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();

function encodeEmailForFirebase(email) {
  return email.replaceAll('.', ',');
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event, context) => {
  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: 'OK',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const { email, paymentMethodId } = JSON.parse(event.body || '{}');
    if (!email || !paymentMethodId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing email or paymentMethodId' }),
      };
    }

    // Load user data
    const userSnap = await db.ref(`users/${encodeEmailForFirebase(email)}`).once('value');
    const userData = userSnap.val();

    if (!userData || !userData.stripeCustomerId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'User missing stripeCustomerId' }),
      };
    }

    // Set PaymentMethod as default
    const updatedCustomer = await stripe.customers.update(userData.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Optionally store a flag in Firebase
    await db.ref(`users/${encodeEmailForFirebase(email)}`).update({
      hasDefaultPaymentMethod: true,
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'Default payment method updated',
        customerId: updatedCustomer.id,
      }),
    };
  } catch (err) {
    console.error('Error in setDefaultPaymentMethod:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
