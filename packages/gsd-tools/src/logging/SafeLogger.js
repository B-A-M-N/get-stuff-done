const { inspect } = require('util');

const REDACTION = '[REDACTED]';
const SECRET_PATTERNS = [
  { name: 'openai', regex: /\bsk-[A-Za-z0-9]{16,}\b/g },
  { name: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'github-token', regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: 'bearer-token', regex: /\bBearer\s+[A-Za-z0-9._\-+/=]{12,}\b/gi },
  { name: 'jwt', regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g },
  { name: 'private-key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: 'database-url', regex: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqp|amqps):\/\/[^/\s:@]+:[^@\s/]+@[^\s]+/gi },
  { name: 'generic-credential-assignment', regex: /\b(api[_-]?key|token|secret|password|passwd|auth[_-]?token)\s*[:=]\s*["'][^"'\\\s]{8,}["']/gi },
];
const HIGH_ENTROPY_REGEX = /\b(?=[A-Za-z0-9+/_=-]{32,}\b)(?=[A-Za-z0-9+/_=-]*[a-z])(?=[A-Za-z0-9+/_=-]*[A-Z])(?=(?:.*\d){2,})[A-Za-z0-9+/_=-]{32,}\b/g;

function stringify(value) {
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === 'object') {
    return inspect(value, { depth: 5, breakLength: Infinity, compact: true });
  }
  return String(value);
}

class SafeLogger {
  static sanitize(input) {
    let output = stringify(input);
    for (const { regex } of SECRET_PATTERNS) {
      output = output.replace(regex, REDACTION);
    }
    output = output.replace(HIGH_ENTROPY_REGEX, REDACTION);
    return output;
  }

  static write(writer, message) {
    writer(this.sanitize(message));
  }

  static log(writer, message) {
    this.write(writer, message);
  }

  static info(writer, message) {
    this.write(writer, message);
  }

  static warn(writer, message) {
    this.write(writer, message);
  }

  static error(writer, message) {
    this.write(writer, message);
  }

  static patterns() {
    return [
      ...SECRET_PATTERNS.map(({ name, regex }) => ({ name, regex })),
      { name: 'high-entropy', regex: HIGH_ENTROPY_REGEX },
    ];
  }
}

module.exports = { SafeLogger };
