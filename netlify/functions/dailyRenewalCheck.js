const { schedule } = require('@netlify/functions');
const stripePackage = require('stripe');
const admin = require('firebase-admin');

// Even though this is scheduled, you can still add CORS headers 
// in case you manually invoke it or check logs. 
// Typically it's not called from a browser, but let's keep it consistent:
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

const DEFAULT_MONTHLY_PRICE = process.env.MONTHLY_PRICE_IN_CENTS
  ? parseInt(process.env.MONTHLY_PRICE_IN_CENTS, 10)
  : 1000; // $10.00

/**
 * Schedules the function to run daily at 3:00 UTC, for example.
 * Adjust the cron as you wish: '0 3 * * *' means every day at 03:00 UTC.
 */
exports.handler = schedule('0 3 * * *', async (event, context) => {
  // If you want to handle OPTIONS here, do so:
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: 'OK',
    };
  }

  try {
    const usersRef = db.ref('users');
    const snapshot = await usersRef.once('value');
    const allUsers = snapshot.val();

    if (!allUsers) {
      console.log('No users in DB');
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: 'No users to process' }),
      };
    }

    const today = new Date();
    // Zero out hours to compare date
    today.setUTCHours(0, 0, 0, 0);

    let processedCount = 0;
    let errorsCount = 0;

    const renewPromises = Object.keys(allUsers).map(async (userKey) => {
      const userData = allUsers[userKey];
      if (!userData || userData.status !== 'Active' || !userData.paidUntil) {
        return;
      }

      const paidUntilDate = new Date(userData.paidUntil);
      const compareDate = new Date(paidUntilDate);
      compareDate.setUTCHours(0, 0, 0, 0);

      // If subscription ends today or earlier, attempt to renew
      if (compareDate.getTime() <= today.getTime()) {
        const { stripeCustomerId, email } = userData;
        if (!stripeCustomerId) {
          console.log(`User ${email} missing stripeCustomerId, skipping...`);
          return;
        }

        try {
          const paymentIntent = await stripe.paymentIntents.create({
            amount: DEFAULT_MONTHLY_PRICE,
            currency: 'usd',
            customer: stripeCustomerId,
            payment_method_types: ['card'],
            off_session: true,
            confirm: true,
            description: 'Automatic renewal for 30 days',
            metadata: {
              email,
              autoRenew: true,
            },
          });

          // Success: extend for 30 days from paidUntilDate
          const newPaidUntil = new Date(paidUntilDate);
          newPaidUntil.setDate(newPaidUntil.getDate() + 30);

          await usersRef.child(userKey).update({
            paidUntil: newPaidUntil.toISOString(),
          });

          console.log(`Successfully renewed user: ${email}`);
          processedCount++;
        } catch (error) {
          // Payment failed, mark inactive
          console.error(`Failed to renew user: ${email}`, error.message);
          await usersRef.child(userKey).update({ status: 'Inactive' });
          errorsCount++;
        }
      }
    });

    await Promise.all(renewPromises);

    const resultMessage = `Renewal check complete. Successes: ${processedCount}, Failures: ${errorsCount}`;
    console.log(resultMessage);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: resultMessage }),
    };
  } catch (err) {
    console.error('Error in dailyRenewalCheck:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
});
