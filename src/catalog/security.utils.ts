import * as crypto from 'crypto';

const PEPPER = process.env.PII_PEPPER || 'default-pii-pepper-for-hashing-only';
const ENCRYPTION_KEY_RAW =
  process.env.PII_ENCRYPTION_KEY || 'default-32-byte-key-for-aes-256-cbc-encryption!';

// Ensure the encryption key is exactly 32 bytes
const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY_RAW).digest();

/**
 * Generates a one-way cryptographically secure HMAC hash of a document.
 * This is used to query and enforce uniqueness of sensitive PII documents (e.g. CPF/RG) in the database
 * without storing them in plaintext or indexing the reversible ciphertext.
 *
 * @param doc The plaintext document.
 * @returns A hex-encoded SHA-256 HMAC hash.
 */
export function hashDocument(doc: string): string {
  return crypto.createHmac('sha256', PEPPER).update(doc).digest('hex');
}

/**
 * Symmetrically encrypts a document using AES-256-CBC.
 * To support checking unique constraints on the encrypted value directly or finding matches,
 * the Initialization Vector (IV) is derived deterministically from the document itself.
 *
 * @param doc The plaintext document to encrypt.
 * @returns A colon-separated string in the format "iv:ciphertext" (hex encoded).
 */
export function encryptDocument(doc: string): string {
  // Deterministic IV to support database unique constraint check
  const iv = crypto.createHash('sha256').update(doc).digest().slice(0, 16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(doc, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a previously encrypted document using AES-256-CBC.
 * Accepts values formatted as "hash:iv:ciphertext" (returned by storeDocument)
 * or just "iv:ciphertext".
 * If the value does not match the expected colon-separated encrypted format,
 * it is returned as-is (graceful fallback for legacy or unencrypted text).
 *
 * @param storedValue The stored string from the database.
 * @returns The decrypted document in plaintext.
 */
export function decryptDocument(storedValue: string): string {
  const parts = storedValue.split(':');
  if (parts.length < 3) {
    // If it's not in the format hash:iv:encrypted, it might be legacy or plaintext
    return storedValue;
  }
  const iv = Buffer.from(parts[1], 'hex');
  const encryptedText = parts[2];
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Prepares a document for database storage by combining its hash (for index lookups)
 * and its ciphertext (for administrative retrieval and decryption).
 *
 * @param doc The plaintext document to store.
 * @returns A colon-separated string in the format "hash:iv:ciphertext".
 */
export function storeDocument(doc: string): string {
  const hash = hashDocument(doc);
  const encrypted = encryptDocument(doc);
  return `${hash}:${encrypted}`;
}

/**
 * Mask sensitive personal identification documents (PII) to comply with LGPD.
 * Specifically masks CPFs:
 * - Formatted CPF: "XXX.XXX.XXX-XX" -> "***.XXX.***-**" (shows only the second block)
 * - Unformatted CPF: "XXXXXXXXXXX" -> "***XXX*****" (shows only index 3 to 6)
 * For other documents:
 * - If length > 5, masks everything except the middle 3 characters.
 * - Otherwise returns "***".
 *
 * @param doc The plaintext decrypted document.
 * @returns The masked representation of the document.
 */
interface MaskingStrategy {
  test: (doc: string) => boolean;
  mask: (doc: string) => string;
}

const maskingStrategies: MaskingStrategy[] = [
  {
    // Formatted CPF: "XXX.XXX.XXX-XX" -> "***.XXX.***-**"
    test: (doc) => /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(doc),
    mask: (doc) => `***.${doc.substring(4, 7)}.***-**`,
  },
  {
    // Unformatted CPF: "XXXXXXXXXXX" -> "***XXX*****"
    test: (doc) => /^\d{11}$/.test(doc),
    mask: (doc) => `***${doc.substring(3, 6)}*****`,
  },
  {
    // Generic fallback for masking other documents
    test: (doc) => doc.length > 5,
    mask: (doc) => {
      const midStart = Math.floor(doc.length / 2) - 1;
      const midEnd = midStart + 3;
      const prefix = '*'.repeat(midStart);
      const suffix = '*'.repeat(doc.length - midEnd);
      return `${prefix}${doc.substring(midStart, midEnd)}${suffix}`;
    },
  },
];

export function maskDocument(doc: string): string {
  const strategy = maskingStrategies.find((s) => s.test(doc));
  return strategy ? strategy.mask(doc) : '***';
}
