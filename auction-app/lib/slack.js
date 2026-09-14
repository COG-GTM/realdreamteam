function formatNumber(value) {
  return value == null ? '—' : Number(value).toLocaleString('en-US');
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function notifyNewItem(user, item, event) {
  const text = [
    `New lot for ${user.name}: "${item.title}" by ${item.artist}`,
    `${item.category} · est. $${formatNumber(item.estimateLow ?? item.estimate_low)}–$${formatNumber(item.estimateHigh ?? item.estimate_high)} · ${event.location}, ${formatDate(event.starts_at ?? event.startsAt)}`,
    `${process.env.APP_BASE_URL || 'http://localhost:3000'}/items/${item.id}`
  ].join('\n');

  if (!process.env.SLACK_WEBHOOK_URL) {
    console.log(text);
    return Promise.resolve();
  }

  return fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text })
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`Slack webhook returned ${response.status}`);
    }
  });
}

module.exports = { notifyNewItem };
