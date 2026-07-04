import { encryptBytes, decryptBytes } from './crypto.js';

export async function storeFile(
  bucket: R2Bucket,
  storageRef: string,
  content: Uint8Array,
  encKey: string
): Promise<void> {
  const encrypted = await encryptBytes(content, storageRef, encKey);
  await bucket.put(storageRef, encrypted);
}

export async function retrieveFile(
  bucket: R2Bucket,
  storageRef: string,
  encKey: string
): Promise<Uint8Array | null> {
  const obj = await bucket.get(storageRef);
  if (!obj) return null;
  const encrypted = new Uint8Array(await obj.arrayBuffer());
  return decryptBytes(encrypted, storageRef, encKey);
}
