const stripePackage = require('stripe');
const admin = require('firebase-admin');

// CORS helper: Reusable headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

let app;
if (!admin.apps.length) {
  // Decode base64 service account JSON (if you're storing it in an ENV variable)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL, // e.g. "https://<YOUR_FIREBASE_PROJECT_ID>.firebaseio.com"
  });
}

const db = admin.database();

// Use your test key from environment vars
const stripe = stripePackage(process.env.STRIPE_TEST_KEY);

exports.handler = async (event, context) => {
  // Handle preflight OPTIONS
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
    const body = JSON.parse(event.body || '{}');
    const { email, name } = body; // email is your user identifier

    if (!email) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required parameter: email' }),
      };
    }

    const userRef = db.ref(`users/${encodeURIComponent(email)}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();

    // If user doesn't exist, create a minimal record
    if (!userData) {
      await userRef.set({
        email,
        name: name || '',
        status: 'Inactive',
        paidUntil: '',
        stripeCustomerId: '',
      });
    }

    // Reload user data
    const updatedSnapshot = await userRef.once('value');
    const updatedUserData = updatedSnapshot.val();

    // If user already has a Stripe customer ID, return it
    if (updatedUserData.stripeCustomerId) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: 'User already has a Stripe customer ID',
          stripeCustomerId: updatedUserData.stripeCustomerId,
        }),
      };
    }

    // Otherwise, create a new Customer in Stripe
    const customer = await stripe.customers.create({
      email,
      name,
    });

    // Save to Firebase
    await userRef.update({
      stripeCustomerId: customer.id,
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'Stripe customer created successfully',
        stripeCustomerId: customer.id,
      }),
    };
  } catch (err) {
    console.error('Error creating Stripe customer', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
