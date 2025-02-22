// createSetupIntent.js
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
    const { email } = JSON.parse(event.body || '{}');
    if (!email) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing email' }),
      };
    }

    // Get user from Firebase
    const userSnap = await db.ref(`users/${encodeEmailForFirebase(email)}`).once('value');
    const userData = userSnap.val();

    if (!userData || !userData.stripeCustomerId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'User does not have a stripeCustomerId' }),
      };
    }

    // Create a SetupIntent for this customer
    const setupIntent = await stripe.setupIntents.create({
      customer: userData.stripeCustomerId,
      usage: 'off_session', // so we can use it for future charges
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        clientSecret: setupIntent.client_secret,
      }),
    };
  } catch (err) {
    console.error('Error in createSetupIntent:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
