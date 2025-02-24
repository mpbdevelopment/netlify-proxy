// netlify/functions/scheduledCharge.js

const admin = require('firebase-admin');
const Stripe = require('stripe');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
  } catch (err) {
    console.error('Firebase initialization error:', err);
    throw new Error('Failed to initialize Firebase');
  }
}

const db = admin.database();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Helper to format a Date into a YYYY-MM-DD string in EST.
 * Uses Intl.DateTimeFormat with the "America/New_York" timezone.
 */
function formatDateEST(date) {
  const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  // Using formatToParts to extract parts reliably
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
  let year, month, day;
  for (let part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
  }
  return `${year}-${month}-${day}`;
}

exports.handler = async function(event, context) {
  // This function is intended to run on a schedule.
  try {
    // Get today's date in EST (YYYY-MM-DD)
    const now = new Date();
    const todayStr = formatDateEST(now);

    // Reference the subscriptions node in your Firebase Realtime Database
    const subscriptionsRef = db.ref("subscriptions");
    const snapshot = await subscriptionsRef.once('value');
    const subscriptions = snapshot.val();

    if (!subscriptions) {
      return { statusCode: 200, body: "No subscriptions found." };
    }

    // Array to hold all Firebase update promises
    const updatePromises = [];

    // Iterate over each subscription record
    for (const key in subscriptions) {
      const sub = subscriptions[key];

      // Skip if not active
      if (sub.active !== true) continue;

      // Format the subscription's endDate (in EST)
      const subEndDate = new Date(sub.endDate);
      const subEndDateStr = formatDateEST(subEndDate);

      // If the subscription's endDate matches today (EST), process payment
      if (subEndDateStr === todayStr) {
        try {
          // Create a PaymentIntent using the stored rate (amount in cents)
          // and using the Stripe customer’s default payment method
          const paymentIntent = await stripe.paymentIntents.create({
            amount: sub.rate,
            currency: 'usd',
            customer: sub.customerId,
            confirm: true,
            off_session: true
          });
          
          // Calculate new endDate: 30 days from today.
          const newEndDate = new Date(now);
          newEndDate.setDate(newEndDate.getDate() + 30);
          const newEndDateISO = newEndDate.toISOString();

          // Queue the update to Firebase for this subscription record
          updatePromises.push(
            subscriptionsRef.child(key).update({ endDate: newEndDateISO })
          );
        } catch (paymentError) {
          // Payment failed for this subscription.
          // As per your requirements, no logging or further action is taken.
          console.error(`Payment failed for subscription ${key}:`, paymentError);
        }
      }
    }

    // Wait for all updates to complete.
    await Promise.all(updatePromises);

    return { statusCode: 200, body: "Subscription payments processed." };
  } catch (err) {
    console.error("Error processing subscriptions:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
