const stripe = require('stripe')(process.env.STRIPE_SECRET_DONATE);

exports.handler = async function (event) {
  try {
    const { amount, coverFee } = JSON.parse(event.body);

    // Ensure it's a positive integer (Stripe expects amount in cents)
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid amount.' }),
      };
    }

    // Calculate final amount in cents
    let finalAmount = parsedAmount;
    if (coverFee) {
      finalAmount *= 1.03;
    }

    const roundedAmount = Math.round(finalAmount * 100); // in cents

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Donation',
            },
            unit_amount: roundedAmount,
          },
          quantity: 1,
        },
      ],
      success_url: 'https://yourdomain.com/success',
      cancel_url: 'https://yourdomain.com/cancel',
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error.' }),
    };
  }
};
