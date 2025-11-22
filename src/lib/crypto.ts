export type EncryptionResult = {
  cipherBuffer: ArrayBuffer;
  keyBase64: string;
  ivBase64: string;
};

export async function encryptFile(file: File): Promise<EncryptionResult> {
  const fileBuffer = await file.arrayBuffer();

  const key = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    fileBuffer
  );

  const rawKey = await window.crypto.subtle.exportKey("raw", key);

  return {
    cipherBuffer,
    keyBase64: arrayBufferToBase64(rawKey),
    ivBase64: arrayBufferToBase64(iv.buffer),
  };
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
