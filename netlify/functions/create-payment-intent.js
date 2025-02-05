// netlify/functions/create-payment-intent.js

require('dotenv').config(); // If needed for local dev
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async function (event, context) {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    // Parse the request body for the amount (in USD cents)
    const data = JSON.parse(event.body);
    const amountInCents = data.amountInCents; // e.g. 4599 for $45.99

    if (!amountInCents) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing amountInCents' }),
      };
    }

    // Create a PaymentIntent with the specified amount, in cents
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents, 
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      // optionally attach metadata or receipt_email, etc.
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error' }),
    };
  }
};
