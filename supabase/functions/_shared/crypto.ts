/** AES-GCM para BYOK: chave mestra 32 bytes em base64 (BYOK_MASTER_KEY). */

function getKeyMaterial(masterKeyB64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(masterKeyB64), (c) => c.charCodeAt(0));
  if (raw.length !== 32) {
    throw new Error('BYOK_MASTER_KEY must decode to 32 bytes');
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(plaintext: string, masterKeyB64: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await getKeyMaterial(masterKeyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(buf))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

export async function decryptSecret(ciphertextB64: string, ivB64: string, masterKeyB64: string): Promise<string> {
  const key = await getKeyMaterial(masterKeyB64);
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(buf);
}
