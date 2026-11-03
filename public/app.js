const rows = document.getElementById('confirmation-rows');
const formatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

function cell(row, value, className) {
  const element = document.createElement('td');
  element.textContent = value;
  if (className) element.className = className;
  row.appendChild(element);
  return element;
}

async function refresh() {
  try {
    const response = await fetch('/api/confirmations', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unavailable');
    const events = await response.json();
    document.getElementById('confirmed-count').textContent = events.filter(event => event.status === 'Confirmed').length;
    document.getElementById('latest-event').textContent = events[0]?.orderId || '—';
    document.getElementById('latest-time').textContent = events[0] ? `Received ${formatter.format(new Date(events[0].receivedAt))}` : 'Waiting for a payment';
    document.getElementById('updated').textContent = `Updated ${formatter.format(new Date())}`;
    rows.replaceChildren();
    if (!events.length) {
      const row = document.createElement('tr');
      cell(row, 'Waiting for the first payment event.').colSpan = 5;
      row.firstChild.className = 'empty';
      rows.appendChild(row);
    }
    for (const event of events) {
      const row = document.createElement('tr');
      cell(row, event.orderId);
      cell(row, event.paymentId);
      cell(row, `$${event.amount} ${event.currency}`, 'amount');
      cell(row, formatter.format(new Date(event.receivedAt)));
      const status = cell(row, '');
      const badge = document.createElement('span');
      badge.className = `badge ${event.status.toLowerCase()}`;
      badge.textContent = event.status;
      status.appendChild(badge);
      rows.appendChild(row);
    }
  } catch {
    document.getElementById('updated').textContent = 'Unable to refresh';
  }
}

refresh();
setInterval(refresh, 2000);
