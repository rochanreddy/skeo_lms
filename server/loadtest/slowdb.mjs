// A TCP relay that puts network distance between the API and a local mongod.
//
// A mongod on this machine answers in a fraction of a millisecond, which no
// deployment ever gets: Atlas is across a network. Latency is what makes
// queries pile up inside the connection pool, so a load test without it says
// nothing about whether the pool is big enough.
//
//   SLOWDB_MS=2 SLOWDB_TO=27019 SLOWDB_PORT=27020 node loadtest/slowdb.mjs
//
// SLOWDB_MS is added to each direction. Timers on Windows are coarse (often
// ~15ms), so it prints the round trip it actually achieves: quote that number,
// not the one you asked for.
import net from 'node:net';

const DELAY = Number(process.env.SLOWDB_MS || 2);
const TARGET = Number(process.env.SLOWDB_TO || 27019);
const PORT = Number(process.env.SLOWDB_PORT || 27020);

function relay(from, to) {
  from.on('data', (chunk) => setTimeout(() => { if (!to.destroyed) to.write(chunk); }, DELAY));
  from.on('end', () => setTimeout(() => to.end(), DELAY));
  from.on('error', () => to.destroy());
  from.on('close', () => to.destroy());
}

function connect(client, port) {
  client.setNoDelay(true);
  const upstream = net.connect(port, '127.0.0.1');
  upstream.setNoDelay(true);
  relay(client, upstream);
  relay(upstream, client);
}

net.createServer((client) => connect(client, TARGET)).listen(PORT, '127.0.0.1', () => {
  console.log(`slowdb :${PORT} -> :${TARGET}, +${DELAY}ms each way`);
});

// Measure it: the same relay in front of a local echo server.
const echo = net.createServer((s) => s.on('data', (d) => s.write(d)));
echo.listen(0, '127.0.0.1', () => {
  const relayed = net.createServer((c) => connect(c, echo.address().port));
  relayed.listen(0, '127.0.0.1', () => {
    const socket = net.connect(relayed.address().port, '127.0.0.1', async () => {
      const samples = [];
      for (let i = 0; i < 40; i += 1) {
        const t = performance.now();
        await new Promise((r) => { socket.once('data', r); socket.write('x'); });
        samples.push(performance.now() - t);
      }
      samples.sort((a, b) => a - b);
      console.log(`measured round trip ~${samples[20].toFixed(1)}ms`);
      socket.destroy();
      relayed.close();
      echo.close();
    });
  });
});
