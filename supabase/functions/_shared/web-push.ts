/**
 * Web Push protocol implementation using Deno Web Crypto API.
 * RFC 8291 (Message Encryption) + RFC 8292 (VAPID).
 */

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushResult {
  success: boolean;
  endpoint: string;
  statusCode?: number;
  error?: string;
}

// ── Base64URL helpers ──────────────────────────────────────────

function b64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── HKDF (Extract + Expand in one step) ───────────────────────

async function hkdf(
  ikm: ArrayBuffer | Uint8Array,
  salt: ArrayBuffer | Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
}

// ── VAPID JWT (ES256) ─────────────────────────────────────────

async function createVapidAuth(
  endpoint: string,
  publicKey: string,
  privateKey: string,
  subject: string,
): Promise<string> {
  const pubBytes = b64UrlDecode(publicKey);
  const x = b64UrlEncode(pubBytes.slice(1, 33));
  const y = b64UrlEncode(pubBytes.slice(33, 65));

  const signingKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d: privateKey },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const header = b64UrlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64UrlEncode(new TextEncoder().encode(JSON.stringify({ aud, exp, sub: subject })));

  const input = new TextEncoder().encode(`${header}.${payload}`);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, input);

  return `vapid t=${header}.${payload}.${b64UrlEncode(sig)}, k=${publicKey}`;
}

// ── Payload encryption (RFC 8291 / aes128gcm) ────────────────

async function encrypt(sub: PushSubscription, plaintext: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(plaintext);

  const subscriberPub = await crypto.subtle.importKey(
    'raw',
    b64UrlDecode(sub.keys.p256dh),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const authSecret = b64UrlDecode(sub.keys.auth);

  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberPub },
    ephemeral.privateKey,
    256,
  );

  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));
  const subPubRaw = b64UrlDecode(sub.keys.p256dh);

  // info = "WebPush: info\x00" || subscriber_pub(65) || server_pub(65)
  const prefix = new TextEncoder().encode('WebPush: info\x00');
  const ikmInfo = new Uint8Array(prefix.length + subPubRaw.length + ephPubRaw.length);
  ikmInfo.set(prefix);
  ikmInfo.set(subPubRaw, prefix.length);
  ikmInfo.set(ephPubRaw, prefix.length + subPubRaw.length);

  const ikm = await hkdf(sharedSecret, authSecret, ikmInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, new TextEncoder().encode('Content-Encoding: aes128gcm\x00'), 16);
  const nonce = await hkdf(ikm, salt, new TextEncoder().encode('Content-Encoding: nonce\x00'), 12);

  // Pad: plaintext || 0x02 (last-record delimiter)
  const padded = new Uint8Array(data.length + 1);
  padded.set(data);
  padded[data.length] = 0x02;

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded),
  );

  // aes128gcm body: salt(16) || rs(4, uint32 BE) || idlen(1) || keyid(65) || ciphertext
  const body = new Uint8Array(16 + 4 + 1 + ephPubRaw.length + ciphertext.length);
  body.set(salt, 0);
  new DataView(body.buffer).setUint32(16, 4096);
  body[20] = ephPubRaw.length;
  body.set(ephPubRaw, 21);
  body.set(ciphertext, 21 + ephPubRaw.length);

  return body;
}

// ── Public API ────────────────────────────────────────────────

export async function sendWebPush(
  subscription: PushSubscription,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
): Promise<PushResult> {
  try {
    const authorization = await createVapidAuth(
      subscription.endpoint,
      vapidPublicKey,
      vapidPrivateKey,
      vapidSubject,
    );
    const body = await encrypt(subscription, payload);

    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '2419200',
      },
      body,
    });

    if (res.status >= 200 && res.status < 300) {
      return { success: true, endpoint: subscription.endpoint, statusCode: res.status };
    }

    const errText = await res.text().catch(() => '');
    return { success: false, endpoint: subscription.endpoint, statusCode: res.status, error: errText || `HTTP ${res.status}` };
  } catch (err) {
    return {
      success: false,
      endpoint: subscription.endpoint,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
