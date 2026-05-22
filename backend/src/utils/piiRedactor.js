// src/utils/piiRedactor.js
// Strips common PII patterns before storing logs/previews in the database
// This is a regex-based approach — good enough for a demo; production would
// use a dedicated library like presidio or AWS Comprehend for better recall

const PATTERNS = [
  // Email addresses
  { name: "email", regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, replacement: "[EMAIL]" },
  // US/Indian phone numbers
  { name: "phone", regex: /(\+?[\d\-\s()]{10,15})/g, replacement: "[PHONE]" },
  // Credit card numbers (basic 16-digit pattern)
  { name: "credit_card", regex: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, replacement: "[CARD]" },
  // SSN / Aadhaar-style numbers
  { name: "ssn", regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, replacement: "[SSN]" },
  // IP addresses
  { name: "ip", regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: "[IP]" },
];

/**
 * Redact PII from a string.
 * Returns { redacted: string, foundPII: string[] }
 */
export function redactPII(text) {
  if (!text || typeof text !== "string") return { redacted: text, foundPII: [] };

  let redacted = text;
  const foundPII = [];

  for (const pattern of PATTERNS) {
    if (pattern.regex.test(redacted)) {
      foundPII.push(pattern.name);
    }
    // Reset lastIndex after test()
    pattern.regex.lastIndex = 0;
    redacted = redacted.replace(pattern.regex, pattern.replacement);
  }

  return { redacted, foundPII };
}

/**
 * Redact PII from both input and output preview fields of a log payload.
 */
export function redactLogPII(payload) {
  const { redacted: inputPreview, foundPII: inputPII } = redactPII(payload.inputPreview);
  const { redacted: outputPreview, foundPII: outputPII } = redactPII(payload.outputPreview);

  return {
    ...payload,
    inputPreview,
    outputPreview,
    piiDetected: [...new Set([...inputPII, ...outputPII])],
  };
}
