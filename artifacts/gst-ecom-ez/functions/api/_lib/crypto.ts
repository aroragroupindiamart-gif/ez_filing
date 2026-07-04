function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function importAesKey(hexKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    hexToBytes(hexKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptStr(plaintext: string, aad: string, hexKey: string): Promise<string> {
  const key = await importAesKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    key,
    enc.encode(plaintext)
  );
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptStr(token: string, aad: string, hexKey: string): Promise<string> {
  const key = await importAesKey(hexKey);
  const combined = Uint8Array.from(atob(token), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const enc = new TextEncoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}

export async function encryptBytes(data: Uint8Array, aad: string, hexKey: string): Promise<Uint8Array> {
  const key = await importAesKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
    key,
    data
  );
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return combined;
}

export async function decryptBytes(data: Uint8Array, aad: string, hexKey: string): Promise<Uint8Array> {
  const key = await importAesKey(hexKey);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
    key,
    ciphertext
  );
  return new Uint8Array(plaintext);
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function signDownloadToken(
  id: string,
  hexKey: string,
  ttlSeconds = 300
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const payload = `${id}|${expiresAt}`;
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(hexKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { token: btoa(`${payload}|${sigHex}`), expiresAt };
}

export async function verifyDownloadToken(
  token: string,
  hexKey: string
): Promise<string | null> {
  try {
    const decoded = atob(token);
    const parts = decoded.split('|');
    if (parts.length < 3) return null;
    const sigHex = parts.pop()!;
    const expiresAt = parseInt(parts.pop()!);
    const id = parts.join('|');
    if (Date.now() > expiresAt) return null;
    const payload = `${id}|${expiresAt}`;
    const key = await crypto.subtle.importKey(
      'raw',
      hexToBytes(hexKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      hexToBytes(sigHex),
      new TextEncoder().encode(payload)
    );
    return valid ? id : null;
  } catch {
    return null;
  }
}
