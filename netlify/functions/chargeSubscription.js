const stripePackage = require('stripe');
const admin = require('firebase-admin');

let app;
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString()
  );
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();
const stripe = stripePackage(process.env.STRIPE_TEST_KEY);

// Hardcoded monthly price in cents (example: $10.00 = 1000 cents)
const DEFAULT_MONTHLY_PRICE = process.env.MONTHLY_PRICE_IN_CENTS
  ? parseInt(process.env.MONTHLY_PRICE_IN_CENTS, 10)
  : 1000; // fallback to $10 if env variable not set

exports.handler = async (event, context) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method Not Allowed' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { email, monthsToAdd } = body;

    if (!email || !monthsToAdd) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing email or monthsToAdd' }),
      };
    }

    const userRef = db.ref(`users/${encodeURIComponent(email)}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();

    if (!userData) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found in Firebase' }),
      };
    }

    const { stripeCustomerId, status, paidUntil } = userData;

    if (!stripeCustomerId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'User has no Stripe customer ID' }),
      };
    }

    // Calculate total charge amount
    const totalAmount = DEFAULT_MONTHLY_PRICE * monthsToAdd;

    // Create a PaymentIntent in Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      off_session: true,     // Indicates we might be charging without the user present
      confirm: true,         // Attempt to confirm the payment immediately
      description: `Subscription charge for ${monthsToAdd} month(s)`,
      metadata: {
        email,
        monthsToAdd
      }
    });

    // If payment fails or requires action, Stripe will throw an error
    // If success, update the user’s subscription info
    const now = new Date();
    let newPaidUntil = now;

    // If the user is currently paid through some date, start from that date if it's in the future
    if (paidUntil) {
      const paidUntilDate = new Date(paidUntil);
      if (paidUntilDate > now) {
        newPaidUntil = paidUntilDate;
      }
    }

    // Add (30 days * monthsToAdd) to the paidUntil date
    const daysToAdd = 30 * monthsToAdd;
    newPaidUntil.setDate(newPaidUntil.getDate() + daysToAdd);

    // Update Firebase
    await userRef.update({
      status: 'Active',
      paidUntil: newPaidUntil.toISOString()
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Payment successful, subscription extended',
        paymentIntentId: paymentIntent.id,
        newPaidUntil: newPaidUntil.toISOString()
      }),
    };
  } catch (err) {
    console.error('Error charging for subscription', err);

    // If payment fails, optionally mark user as Inactive
    // But that might be only for auto-renewal. For manual extends, the user might remain Inactive if they never had an active subscription in the first place.
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
