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

// Set CORS headers to allow cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // For production, replace "*" with your domain
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event, context) => {
  // Handle CORS preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "OK",
    };
  }

  try {
    // Parse incoming request body
    const { email, prepayMonths, paymentMethodId } = JSON.parse(event.body);
    const now = new Date();

    // Determine the billing cycle anchor based on the current date
    // April 7 is represented as (month index 3, since months are 0-indexed)
    const april7 = new Date(now.getFullYear(), 3, 7);
    let billingCycleAnchor;

    if (now < april7) {
      // For purchases before April 7, charge immediately and set next billing on May 7
      billingCycleAnchor = new Date(now.getFullYear(), 4, 7); // May 7 (month index 4)
      if (prepayMonths > 1) {
        // Extend the anchor for additional pre-paid months (each additional month = 30 days)
        billingCycleAnchor = new Date(
          billingCycleAnchor.getTime() + (prepayMonths - 1) * 30 * 24 * 60 * 60 * 1000
        );
      }
    } else {
      // For purchases on or after April 7, add (prepayMonths × 30 days) to the current date
      billingCycleAnchor = new Date(
        now.getTime() + prepayMonths * 30 * 24 * 60 * 60 * 1000
      );
    }
    const anchorTimestamp = Math.floor(billingCycleAnchor.getTime() / 1000);

    // Retrieve or create a Stripe customer based on the provided email
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

    // Create the subscription with the calculated billing cycle anchor
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.STRIPE_PRICE_ID }],
      billing_cycle_anchor: anchorTimestamp,
      proration_behavior: 'none',
      expand: ['latest_invoice.payment_intent'],
    });

    // Log subscription details to Firebase Realtime Database
    const db = admin.database();
    const ref = db.ref('subscriptions').push();
    await ref.set({
      email,
      customerId: customer.id,
      subscriptionId: subscription.id,
      paidThrough: billingCycleAnchor.toISOString(),
      created: now.toISOString(),
      // Optionally, include more data such as payment timestamps, etc.
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ subscriptionId: subscription.id }),
    };
  } catch (error) {
    console.error("Error creating subscription:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
