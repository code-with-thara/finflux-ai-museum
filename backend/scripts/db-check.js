/**
 * Atlas connectivity diagnostic (TMP tool). Stages: URI parse -> DNS SRV ->
 * TCP -> TLS handshake -> driver connect -> ping -> counts. Secrets redacted.
 * Usage: node scripts/db-check.js
 */
import dns from 'dns/promises';
import net from 'net';
import tls from 'tls';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

function redact(uri) {
  return uri.replace(/\/\/([^:/?#]+):([^@/?#]*)@/g, '//$1:<redacted>@');
}

const uri = process.env.MONGODB_URI || '';
console.log('stage 0: env present:', Boolean(uri));
if (!uri) {
  console.log('MONGODB_URI missing');
  process.exit(2);
}
console.log('stage 0: uri =', redact(uri));

let m;
try {
  m = new URL(uri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://'));
} catch (e) {
  console.log('stage 1: URI PARSE FAIL:', e.message);
  process.exit(2);
}
const isSrv = uri.startsWith('mongodb+srv://');
console.log('stage 1: scheme ok (srv=' + isSrv + '), user =', m.username || '(none)', '| db path =', m.pathname || '(default)');

let hosts = [];
try {
  if (isSrv) {
    const srv = await dns.resolveSrv(`_mongodb._tcp.${m.hostname}`);
    hosts = srv.map((r) => ({ host: r.name.replace(/\.$/, ''), port: r.port }));
    console.log(`stage 2: DNS SRV ok -> ${hosts.length} host(s)`);
    hosts.slice(0, 5).forEach((h) => console.log(`   - ${h.host}:${h.port}`));
  } else {
    hosts = [{ host: m.hostname, port: Number(m.port) || 27017 }];
    console.log('stage 2: direct host, skipping SRV');
  }
} catch (e) {
  console.log('stage 2: DNS SRV FAIL:', e.code || e.message);
  process.exit(2);
}

for (const h of hosts.slice(0, 3)) {
  const tcpOk = await new Promise((resolve) => {
    const s = net.connect(h.port, h.host);
    s.setTimeout(8000);
    s.on('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.on('timeout', () => {
      s.destroy();
      resolve(false);
    });
    s.on('error', () => resolve(false));
  });
  console.log(`stage 3: TCP ${h.host}:${h.port} ->`, tcpOk ? 'OPEN' : 'FAIL');
  if (!tcpOk) continue;
  const tlsInfo = await new Promise((resolve) => {
    const s = tls.connect(
      { host: h.host, port: h.port, servername: h.host, timeout: 10000 },
      () => {
        const out = { ok: true, proto: s.getProtocol(), cipher: s.getCipher()?.name };
        s.destroy();
        resolve(out);
      }
    );
    s.on('timeout', () => {
      s.destroy();
      resolve({ ok: false, err: 'timeout' });
    });
    s.on('error', (e) => resolve({ ok: false, err: e.message }));
  });
  console.log(`stage 4: TLS ${h.host} ->`, JSON.stringify(tlsInfo));
}

console.log('stage 5: driver connect...');
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('stage 5: driver CONNECT OK, state =', mongoose.connection.readyState);
  const admin = mongoose.connection.db.admin();
  const ping = await admin.ping();
  console.log('stage 6: ping =', JSON.stringify(ping));
  const cols = await mongoose.connection.db.listCollections().toArray();
  console.log('stage 7: collections =', cols.map((c) => c.name).join(','));
  await mongoose.disconnect();
  console.log('ALL STAGES OK');
} catch (e) {
  console.log('stage 5/6: DRIVER FAIL:', e.name + ':', e.message.split('\n')[0]);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
