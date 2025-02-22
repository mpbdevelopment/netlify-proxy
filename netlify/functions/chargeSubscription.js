const stripePackage = require('stripe');
const admin = require('firebase-admin');

// CORS helper
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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

// Hardcoded monthly price (or use another ENV var if you prefer)
const DEFAULT_MONTHLY_PRICE = process.env.MONTHLY_PRICE_IN_CENTS
  ? parseInt(process.env.MONTHLY_PRICE_IN_CENTS, 10)
  : 1000; // $10.00

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
    const { email, monthsToAdd } = body;

    if (!email || !monthsToAdd) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing email or monthsToAdd' }),
      };
    }

    const userRef = db.ref(`users/${encodeURIComponent(email)}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();

    if (!userData) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'User not found in Firebase' }),
      };
    }

    const { stripeCustomerId, paidUntil } = userData;
    if (!stripeCustomerId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'User has no Stripe customer ID' }),
      };
    }

    // Calculate total price
    const totalAmount = DEFAULT_MONTHLY_PRICE * monthsToAdd;

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      off_session: true, // user is not actively in the checkout
      confirm: true,     // attempt to confirm immediately
      description: `Subscription charge for ${monthsToAdd} month(s)`,
      metadata: {
        email,
        monthsToAdd,
      },
    });

    // If successful, update paidUntil
    const now = new Date();
    let newPaidUntil = now;

    if (paidUntil) {
      const paidUntilDate = new Date(paidUntil);
      if (paidUntilDate > now) {
        newPaidUntil = paidUntilDate;
      }
    }

    // Add 30 days * monthsToAdd
    newPaidUntil.setDate(newPaidUntil.getDate() + (30 * monthsToAdd));

    await userRef.update({
      status: 'Active',
      paidUntil: newPaidUntil.toISOString(),
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'Payment successful, subscription extended',
        paymentIntentId: paymentIntent.id,
        newPaidUntil: newPaidUntil.toISOString(),
      }),
    };
  } catch (err) {
    console.error('Error charging for subscription', err);
    // Optional: Mark user as inactive if needed
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
