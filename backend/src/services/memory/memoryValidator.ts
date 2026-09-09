/**
 * TwinMemory™ — Sensitive Information Validator
 * 
 * Ensures sensitive data such as API keys, passwords, private keys,
 * authentication tokens, and financial credentials are NEVER persisted
 * as long-term memories.
 */

const SENSITIVE_PATTERNS: RegExp[] = [
  // OpenAI, Anthropic, Google, Stripe, AWS API keys
  /sk-[A-Za-z0-9_-]{20,}/i,
  /sk-ant-[A-Za-z0-9_-]{20,}/i,
  /AIza[0-9A-Za-z_-]{20,}/,
  /AQ\.[0-9A-Za-z_-]{20,}/,
  /AKIA[0-9A-Z]{12,}/,
  /(?:secret|live|test)_[a-zA-Z0-9]{24,}/i,
  
  // Private keys and certificates
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/i,
  /-----BEGIN\s+CERTIFICATE-----/i,
  /-----BEGIN\s+ENCRYPTED\s+PRIVATE\s+KEY-----/i,

  // Passwords and explicit credentials
  /(?:password|passwd|pwd|secret)\s*[:=]\s*['"]?[^\s'"]{4,}['"]?/i,
  /(?:my\s+password\s+is\s+)[^\s.]{4,}/i,

  // JWT and Bearer tokens
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /Bearer\s+[A-Za-z0-9_-]{20,}/i,

  // Credit card numbers (standard 13-19 digit card numbers with separators)
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/,

  // Social Security Numbers (SSN)
  /\b\d{3}-\d{2}-\d{4}\b/,
];

/**
 * Returns true if the text contains any secret or sensitive credential.
 */
export function containsSensitiveInformation(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Validates candidate memory content.
 * Returns valid = false if it contains sensitive information or violates length constraints.
 */
export function validateMemoryContent(content: string): { valid: boolean; reason?: string } {
  const trimmed = content.trim();
  if (trimmed.length < 3) {
    return { valid: false, reason: 'Memory content is too short' };
  }
  if (trimmed.length > 2000) {
    return { valid: false, reason: 'Memory content exceeds maximum length of 2000 characters' };
  }
  if (containsSensitiveInformation(trimmed)) {
    return { valid: false, reason: 'Memory contains sensitive credentials or confidential tokens' };
  }
  return { valid: true };
}

