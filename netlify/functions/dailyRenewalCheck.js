const { schedule } = require('@netlify/functions'); // For scheduled function
const stripePackage = require('stripe');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already
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

const DEFAULT_MONTHLY_PRICE = process.env.MONTHLY_PRICE_IN_CENTS
  ? parseInt(process.env.MONTHLY_PRICE_IN_CENTS, 10)
  : 1000; // fallback to $10 if env variable not set

/**
 * Netlify Scheduled Function
 * 
 * This function will run daily (or on a schedule you specify) and:
 *  - Fetch all users with status = 'Active'.
 *  - Compare 'paidUntil' with today's date.
 *  - If paidUntil is "today" or earlier, attempt to charge them for the next 30 days.
 *  - On success, update paidUntil by 30 days.
 *  - On failure, mark them as 'Inactive'.
 */
exports.handler = schedule('0 3 * * *', async (event, context) => {
  // The schedule cron here says "run every day at 03:00 UTC".
  // Adjust as needed in your Netlify settings or function config.

  try {
    const usersRef = db.ref('users');
    const snapshot = await usersRef.once('value');
    const allUsers = snapshot.val();

    if (!allUsers) {
      console.log('No users in database');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No users to process' }),
      };
    }

    const today = new Date();
    // We'll zero out hours/min/sec to compare date only
    today.setUTCHours(0, 0, 0, 0);
    const todayString = today.toISOString().split('T')[0];

    let processedCount = 0;
    let errorsCount = 0;

    const userPromises = Object.keys(allUsers).map(async (key) => {
      const userData = allUsers[key];
      if (userData.status !== 'Active' || !userData.paidUntil) {
        return;
      }

      const paidUntilDate = new Date(userData.paidUntil);
      // Zero out hours for comparison
      const compareDate = new Date(paidUntilDate);
      compareDate.setUTCHours(0, 0, 0, 0);

      // If user is paid through "today" or earlier, attempt renewal
      if (compareDate.getTime() <= today.getTime()) {
        // Attempt to charge
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
            description: `Automatic renewal for 30 days`,
            metadata: {
              email,
              autoRenew: true
            },
          });

          // If we reach here, charge was successful
          // Update user paidUntil by 30 days from current paidUntil
          const newPaidUntil = new Date(paidUntilDate);
          newPaidUntil.setDate(newPaidUntil.getDate() + 30);

          await usersRef.child(key).update({
            paidUntil: newPaidUntil.toISOString(),
          });

          console.log(`Successfully renewed user: ${email}`);
          processedCount += 1;
        } catch (error) {
          // Payment failed, mark user as Inactive
          console.error(`Failed to renew user: ${email}`, error.message);
          await usersRef.child(key).update({ status: 'Inactive' });
          errorsCount += 1;
        }
      }
    });

    await Promise.all(userPromises);

    const resultMessage = `Renewal check complete. Successes: ${processedCount}, Failures: ${errorsCount}`;
    console.log(resultMessage);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: resultMessage }),
    };
  } catch (err) {
    console.error('Error in dailyRenewalCheck:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
});
