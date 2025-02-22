const stripePackage = require('stripe');
const admin = require('firebase-admin');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function encodeEmailForFirebase(email) {
  return email.replaceAll('.', ',');
}

let app;
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();
const stripe = stripePackage(process.env.STRIPE_TEST_KEY);

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
    const body = JSON.parse(event.body || '{}');
    const { email, name } = body;
    if (!email) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required parameter: email' }),
      };
    }

    // Encode the email for the Firebase key
    const encodedEmailKey = encodeEmailForFirebase(email);

    // Reference the DB path with the encoded email
    const userRef = db.ref(`users/${encodedEmailKey}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();

    if (!userData) {
      // Create a minimal record, storing the *real* email inside
      await userRef.set({
        email,   // store actual email so we don’t lose the dot
        name: name || '',
        status: 'Inactive',
        paidUntil: '',
        stripeCustomerId: '',
      });
    }

    // Reload user data after we potentially created it
    const updatedSnapshot = await userRef.once('value');
    const updatedUserData = updatedSnapshot.val();

    // If they already have a stripeCustomerId, return it
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

    // Create a Stripe customer using the actual email
    const customer = await stripe.customers.create({
      email,
      name,
    });

    // Save the stripeCustomerId
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
    console.error('Error in createCustomer:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
