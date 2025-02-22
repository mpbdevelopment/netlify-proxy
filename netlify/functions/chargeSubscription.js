// functions/chargeSubscription.js
const stripe = require('stripe')(process.env.STRIPE_TEST_KEY);
// If using Firebase Admin SDK:
const admin = require('firebase-admin');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Parse request
    const data = JSON.parse(event.body);
    const { userId, monthsToAdd, pricePerMonth } = data;

    // Your logic to fetch user from Firebase (using admin or a direct REST call)
    // Create PaymentIntent with Stripe
    // Update user's paidUntil date, etc.

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
  }
};
