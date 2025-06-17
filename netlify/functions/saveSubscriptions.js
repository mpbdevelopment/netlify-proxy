/* netlify/functions/saveSubscription.js */
let SUBS = [];   // ← replace with persistent storage later!

export default async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: 'Method Not Allowed' };

  const sub = JSON.parse(event.body);

  /* Upsert by endpoint */
  const i = SUBS.findIndex(s => s.endpoint === sub.endpoint);
  if (i > -1) SUBS[i] = sub; else SUBS.push(sub);

  return { statusCode: 200, body: JSON.stringify({ saved: true }) };
};

/* Optional helper for other functions */
export function allSubs() { return SUBS; }
