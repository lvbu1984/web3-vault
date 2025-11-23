// src/lib/crypto.ts

// 用来描述每个加密文件的元数据
export type EncryptedFileMeta = {
  algorithm: "AES-GCM";
  keyBase64: string; // 导出的原始 AES 密钥（base64）
  ivBase64: string;  // 初始向量 IV（base64）
  originalName: string;
  mimeType: string;
  originalSize: number;
};

// ArrayBuffer / Uint8Array -> base64 互转工具
function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuf(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 生成 12 字节随机 IV（AES-GCM 推荐）
 */
function generateIv(): Uint8Array {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  return iv;
}

/**
 * 加密一个浏览器 File 对象
 * - 使用 AES-256-GCM
 * - 为每个文件生成随机密钥和随机 IV
 * - 返回加密后的 Blob + 元数据（里面带 key 和 iv）
 */
export async function encryptFile(
  file: File
): Promise<{ encryptedBlob: Blob; meta: EncryptedFileMeta }> {
  const fileBuffer = await file.arrayBuffer();

  // 生成 AES-256 密钥
  const cryptoKey = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true, // 是否允许导出密钥（需要导出成 base64 方便演示）
    ["encrypt", "decrypt"]
  );

  // 生成随机 IV
  const iv = generateIv();

  // 加密
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    cryptoKey,
    fileBuffer
  );

  // 导出原始密钥（ArrayBuffer -> base64）
  const rawKey = await crypto.subtle.exportKey("raw", cryptoKey);
  const keyBase64 = bufToBase64(rawKey);
  const ivBase64 = bufToBase64(iv.buffer);

  const encryptedBlob = new Blob([encryptedBuffer], {
    type: "application/octet-stream",
  });

  const meta: EncryptedFileMeta = {
    algorithm: "AES-GCM",
    keyBase64,
    ivBase64,
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
    originalSize: file.size,
  };

  return { encryptedBlob, meta };
}

/**
 * （预留）解密函数：给定加密的 ArrayBuffer + meta，可以还原成原始 ArrayBuffer
 * 现在我们先不用，在后续「文件下载 / 解密」功能中会用到
 */
export async function decryptToArrayBuffer(
  encrypted: ArrayBuffer,
  meta: EncryptedFileMeta
): Promise<ArrayBuffer> {
  const rawKeyBuf = base64ToBuf(meta.keyBase64);
  const key = await crypto.subtle.importKey(
    "raw",
    rawKeyBuf,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["decrypt"]
  );

  const ivBuf = base64ToBuf(meta.ivBase64);
  const iv = new Uint8Array(ivBuf);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encrypted
  );

  return decrypted;
}
