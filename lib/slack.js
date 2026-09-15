function money(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(Number(amount));
}

function messageFor(user, lot, auction) {
  const artist = lot.artist ? ` by ${lot.artist}` : '';
  const estimate = lot.estimate_low && lot.estimate_high
    ? `${money(lot.estimate_low, lot.currency)}–${money(lot.estimate_high, lot.currency)}`
    : 'estimate upon request';
  const date = new Date(auction.starts_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Chicago'
  });
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
  return `New lot for ${user.name}: "${lot.title}"${artist}\n` +
    `${lot.category} · est. ${estimate} · ${auction.location}, ${date}\n` +
    `${baseUrl}/lots/${lot.id}`;
}

// Posts `text` to the Slack webhook when SLACK_WEBHOOK_URL is set, otherwise
// logs it. Never throws: Slack is an optional extra and must not break a write.
async function notify(text) {
  if (!process.env.SLACK_WEBHOOK_URL) {
    console.log(`[slack] ${text}`);
    return true;
  }
  try {
    const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    });
    return response.ok;
  } catch (error) {
    console.error('[slack]', error.message);
    return false;
  }
}

function notifyNewItem(user, lot, auction) {
  return notify(messageFor(user, lot, auction));
}

module.exports = { notify, notifyNewItem, messageFor, money };
