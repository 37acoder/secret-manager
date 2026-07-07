const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PATTERNS = [
  /value/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /cookie/i,
  /^sm_master_key$/i
];

export function redact(input: unknown): unknown {
  return redactInner(input, new WeakSet<object>());
}

export function redactForLog(input: unknown): string {
  return JSON.stringify(redact(input));
}

export function redactError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { error: redact(error) };
  }

  return redact({
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: "cause" in error ? error.cause : undefined
  }) as Record<string, unknown>;
}

export function redactForSnapshot(input: unknown): unknown {
  return redact(input);
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function redactInner(input: unknown, seen: WeakSet<object>): unknown {
  if (input === null || typeof input !== "object") {
    return input;
  }

  if (seen.has(input)) {
    return "[Circular]";
  }
  seen.add(input);

  if (Array.isArray(input)) {
    return input.map((item) => redactInner(item, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = isSensitiveKey(key) ? REDACTED : redactInner(value, seen);
  }
  return output;
}
