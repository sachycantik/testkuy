const clients = new Map();

function addClient(address, res) {
  if (!clients.has(address)) {
    clients.set(address, new Set());
  }
  clients.get(address).add(res);
}

function removeClient(address, res) {
  if (clients.has(address)) {
    clients.get(address).delete(res);
    if (clients.get(address).size === 0) {
      clients.delete(address);
    }
  }
}

function sendToInbox(address, event, data) {
  if (!clients.has(address)) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.get(address).forEach(res => {
    try {
      res.write(payload);
    } catch (_) {
      clients.get(address).delete(res);
    }
  });
}

module.exports = { addClient, removeClient, sendToInbox };
//
