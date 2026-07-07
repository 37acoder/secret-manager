import { describe, expect, it } from "vitest";
import { redact, redactError, redactForLog, redactForSnapshot } from "./redaction.js";

describe("redaction", () => {
  it("redacts sensitive field names recursively", () => {
    const redacted = redact({
      value: "plain",
      secret: "plain",
      token: "plain",
      authorization: "Bearer token",
      cookie: "session=plain",
      SM_MASTER_KEY: "base64-key",
      nested: {
        apiToken: "plain",
        safe: "visible"
      }
    });

    expect(redacted).toEqual({
      value: "[REDACTED]",
      secret: "[REDACTED]",
      token: "[REDACTED]",
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      SM_MASTER_KEY: "[REDACTED]",
      nested: {
        apiToken: "[REDACTED]",
        safe: "visible"
      }
    });
  });

  it("supports logger, error, and snapshot redaction entry points", () => {
    const payload = { requestId: "req_1", secretValue: "plain" };
    const error = new Error("failed with secret value");

    expect(redactForLog(payload)).not.toContain("plain");
    expect(redactError(error).message).toBe("failed with secret value");
    expect(redactForSnapshot(payload)).toEqual({ requestId: "req_1", secretValue: "[REDACTED]" });
  });
});
