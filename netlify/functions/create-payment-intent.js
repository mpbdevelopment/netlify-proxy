// netlify/functions/create-payment-intent.js
// Example with CORS support

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // 1) Handle the OPTIONS preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",  // or your domain
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: "OK"
    };
  }

  // 2) Otherwise, handle the actual request
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 
        "Access-Control-Allow-Origin": "*", 
      },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const data = JSON.parse(event.body);
    const amountInCents = data.amountInCents;

    if (!amountInCents) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*", 
        },
        body: JSON.stringify({ error: "Missing amountInCents" }),
      };
    }

    // Create the PaymentIntent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
    });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",  // or your site domain if you prefer
      },
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*", 
      },
      body: JSON.stringify({ error: 'Server error' }),
    };
  }
};

