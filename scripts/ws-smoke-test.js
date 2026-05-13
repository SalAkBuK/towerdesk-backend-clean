const { io } = require('socket.io-client');

const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000/api';
const wsBaseUrl =
  process.env.WS_BASE_URL || apiBaseUrl.replace(/\/api\/?$/, '');
const token = process.env.WS_SMOKE_TOKEN;

if (!token) {
  console.error('WS_SMOKE_TOKEN is required');
  process.exit(1);
}

const connectUrl = `${wsBaseUrl}/notifications`;
const socket = io(connectUrl, {
  transports: ['websocket'],
  auth: { token },
});

const timeoutMs = 3000;

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const waitForEvent = (event) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const createDevNotification = async () => {
  const response = await fetch(`${apiBaseUrl}/dev/notifications/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title: 'WS smoke test', data: { source: 'smoke' } }),
  });

  if (!response.ok) {
    throw new Error(`Dev notification failed: ${response.status}`);
  }
};

const run = async () => {
  try {
    const hello = await waitForEvent('notifications:hello');
    console.log('notifications:hello', hello);

    const next = waitForEvent('notifications:new');
    await createDevNotification();
    const payload = await next;
    console.log('notifications:new', payload?.id || payload);
    socket.disconnect();
    process.exit(0);
  } catch (error) {
    socket.disconnect();
    fail(`Smoke test failed: ${error.message}`);
  }
};

socket.on('connect_error', (error) => {
  fail(`Socket connect error: ${error.message}`);
});

run();
