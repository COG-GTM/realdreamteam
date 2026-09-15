function money(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

function messageFor(user, item, sale) {
  const artist = item.artist ? ` by ${item.artist}` : '';
  const date = new Date(sale.starts_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  });
  const estimate = item.estimate_low && item.estimate_high
    ? `${money(item.estimate_low, item.currency)}–${money(item.estimate_high, item.currency)}`
    : 'estimate upon request';
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
  return `New lot for ${user.name}: "${item.title}"${artist}\n` +
    `${item.category} · est. ${estimate} · ${sale.location}, ${date}\n` +
    `${baseUrl}/items/${item.id}`;
}

async function notifyNewItem(user, item, sale) {
  const text = messageFor(user, item, sale);
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

module.exports = { notifyNewItem, messageFor };
