// subscribe.js (Netlify Function)
const stripe = require('stripe')(process.env.STRIPE_TEST_KEY);
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
  "Access-Control-Allow-Origin": "*", // In production, replace "*" with your domain
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
    // Parse incoming request
    const { email, paymentMethodId } = JSON.parse(event.body);
    const now = new Date();

    // Define April 7 and May 7 for the current year
    const april7 = new Date(now.getFullYear(), 3, 7); // month index 3 = April
    const may7 = new Date(now.getFullYear(), 4, 7);   // month index 4 = May
    const may7Timestamp = Math.floor(may7.getTime() / 1000);

    // Retrieve or create a Stripe customer based on email
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

    let result;

    if (now < april7) {
      // For registrations before April 7, use a Subscription Schedule with two phases:
      // Phase 1: Charges $175 immediately and covers the period until May 7.
      // Phase 2: Automatically starts on May 7 with recurring monthly billing.
      result = await stripe.subscriptionSchedules.create({
        customer: customer.id,
        start_date: 'now',
        end_behavior: 'release',
        phases: [
          {
            // Phase 1: Immediate charge for the period until May 7
            items: [{ price: process.env.STRIPE_PRICE_ID }],
            end_date: may7Timestamp,  // Phase 1 ends on May 7
          },
          {
            // Phase 2: Recurring monthly billing starting automatically after May 7
            items: [{ price: process.env.STRIPE_PRICE_ID }],
            // No start_date here; it begins immediately after phase 1 ends
          },
        ],
      });
    } else {
      // For registrations on or after April 7, create a standard immediate subscription.
      result = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: process.env.STRIPE_PRICE_ID }],
        expand: ['latest_invoice.payment_intent'],
      });
    }

    // Log details to Firebase Realtime Database.
    const db = admin.database();
    const ref = db.ref('subscriptions').push();
    await ref.set({
      email,
      customerId: customer.id,
      subscriptionScheduleId: result.id,
      created: now.toISOString(),
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ subscriptionScheduleId: result.id }),
    };

  } catch (error) {
    console.error("Error creating subscription schedule:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

