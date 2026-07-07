import { describe, expect, it } from "vitest";
import {
  canRevealSecret,
  canWriteSecret,
  tokenCanRead,
  tokenCanWrite,
  validateSecretDraft
} from "./index";

describe("permission helpers", () => {
  it("allows viewers to reveal but not write", () => {
    expect(canRevealSecret("viewer")).toBe(true);
    expect(canWriteSecret("viewer")).toBe(false);
  });

  it("enforces token read/write scopes independently", () => {
    expect(tokenCanRead(["read_secrets"])).toBe(true);
    expect(tokenCanWrite(["read_secrets"])).toBe(false);
  });
});

describe("secret validation", () => {
  it("rejects unsafe keys and oversized values", () => {
    expect(validateSecretDraft({ key: "bad key", value: "x", contentType: "text" })).toHaveLength(1);
    expect(
      validateSecretDraft({
        key: "SAFE_KEY",
        value: "x".repeat(64 * 1024 + 1),
        contentType: "text"
      })
    ).toHaveLength(1);
  });
});
