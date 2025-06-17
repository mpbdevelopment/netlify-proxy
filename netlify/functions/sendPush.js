import webpush from 'web-push';
import { allSubs } from './saveSubscription.js';   // same memory in same lambda runtime

const {
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
} = process.env;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export default async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: 'Method Not Allowed' };

  const defaultPayload = { title: 'Ping!', body: 'Hello from Montclair Pickleball' };
  const payload = JSON.stringify(JSON.parse(event.body || '{}') || defaultPayload);

  const results = await Promise.allSettled(
    allSubs().map(sub => webpush.sendNotification(sub, payload))
  );

  /* Optionally prune subs that returned 410/404 */
  results.forEach((r, i) => {
    if (r.status === 'rejected' && /410|404/.test(r.reason?.statusCode))
      allSubs().splice(i, 1);        // remove invalid subscription
  });

  return { statusCode: 200, body: JSON.stringify(results) };
};
