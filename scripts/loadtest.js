const autocannon = require('autocannon');

const url = process.env.LOADTEST_URL || 'http://localhost:3000/health';
const connections = Number(process.env.LOADTEST_CONNECTIONS || 20);
const duration = Number(process.env.LOADTEST_DURATION || 20);
const pipelining = Number(process.env.LOADTEST_PIPELINING || 1);

autocannon(
  {
    url,
    connections,
    duration,
    pipelining,
  },
  (err, result) => {
    if (err) {
      // eslint-disable-next-line no-console
      console.error('Load test failed', err);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(autocannon.printResult(result));
  },
);
