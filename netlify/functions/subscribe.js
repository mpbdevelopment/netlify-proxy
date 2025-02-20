// subscribe.js (Netlify Function)
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

exports.handler = async (event, context) => {
  try {
    const { email, prepayMonths, paymentMethodId } = JSON.parse(event.body);
    const now = new Date();

    // Determine the cutoff date: April 7 of the current year
    const april7 = new Date(now.getFullYear(), 3, 7); // Note: month is 0-indexed (3 = April)
    let billingCycleAnchor;

    if (now < april7) {
      // For early purchasers: first month is charged immediately and next billing on May 7.
      billingCycleAnchor = new Date(now.getFullYear(), 4, 7); // May 7 (month 4 = May)
      if (prepayMonths > 1) {
        // Extend the anchor by additional 30-day periods for extra months
        billingCycleAnchor = new Date(billingCycleAnchor.getTime() + (prepayMonths - 1) * 30 * 24 * 60 * 60 * 1000);
      }
    } else {
      // For purchases on/after April 7, set anchor to now plus (prepayMonths x 30 days)
      billingCycleAnchor = new Date(now.getTime() + prepayMonths * 30 * 24 * 60 * 60 * 1000);
    }
    const anchorTimestamp = Math.floor(billingCycleAnchor.getTime() / 1000);

    // Create or retrieve a Stripe customer using the provided email.
    let customer;
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email,
        payment_method: paymentMethodId,
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }

    // Create the subscription with the desired billing cycle anchor.
    // The subscription will charge immediately for the period until the anchor date.
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.STRIPE_PRICE_ID }],
      billing_cycle_anchor: anchorTimestamp,
      proration_behavior: 'none',
      expand: ['latest_invoice.payment_intent'],
    });

    // Log subscription details into Firebase Realtime Database.
    const db = admin.database();
    const ref = db.ref('subscriptions').push();
    await ref.set({
      email,
      customerId: customer.id,
      subscriptionId: subscription.id,
      paidThrough: billingCycleAnchor.toISOString(),
      created: now.toISOString(),
      // You can add more details such as invoice payment timestamps, etc.
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ subscriptionId: subscription.id }),
    };
  } catch (error) {
    console.error('Error creating subscription:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
