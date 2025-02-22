const { NetlifySecrets, schedule } = require('@netlify/functions'); // For standard function exports
const stripePackage = require('stripe');
const admin = require('firebase-admin');

/**
 * Initialize Firebase Admin
 * (You can also do this in a shared helper file and import it in each function.)
 */
let app;
if (!admin.apps.length) {
  // For the sake of an example, we assume FIREBASE_SERVICE_ACCOUNT is a Base64-encoded JSON
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString()
  );
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();

// Initialize Stripe
const stripe = stripePackage(process.env.STRIPE_TEST_KEY);

exports.handler = async (event, context) => {
  try {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method Not Allowed' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { email, name } = body;  // Email is the user identifier in Firebase

    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required parameter: email' }),
      };
    }

    // Reference to user record in Firebase Realtime DB
    const userRef = db.ref(`users/${encodeURIComponent(email)}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();

    // If user doesn't exist yet in DB, create a minimal record
    if (!userData) {
      await userRef.set({
        email,
        name: name || '',
        status: 'Inactive',        // default to Inactive until payment
        paidUntil: '',            // no subscription yet
        stripeCustomerId: '',
      });
    }

    // Reload user data (or do an if/else above)
    const updatedSnapshot = await userRef.once('value');
    const updatedUserData = updatedSnapshot.val();

    // If user already has a Stripe customer ID, return it
    if (updatedUserData.stripeCustomerId) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'User already has a Stripe customer ID',
          stripeCustomerId: updatedUserData.stripeCustomerId
        }),
      };
    }

    // Otherwise, create a new Customer in Stripe
    const customer = await stripe.customers.create({
      email,
      name
    });

    // Save the Stripe customer ID in Firebase
    await userRef.update({
      stripeCustomerId: customer.id
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Stripe customer created successfully',
        stripeCustomerId: customer.id,
      }),
    };
  } catch (err) {
    console.error('Error creating Stripe customer', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
