import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveApiKeys } from "./mercury";

describe("resolveApiKeys", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.INCEPTION_API_KEY;
    delete process.env.INCEPTION_API_KEY_FALLBACK;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses only fallback key for fallback-only selector", () => {
    process.env.INCEPTION_API_KEY = "primary-key";
    process.env.INCEPTION_API_KEY_FALLBACK = "fallback-key";

    expect(resolveApiKeys("fallback-only")).toEqual(["fallback-key"]);
  });

  it("throws when fallback-only is requested but fallback is unset", () => {
    process.env.INCEPTION_API_KEY = "primary-key";

    expect(() => resolveApiKeys("fallback-only")).toThrow(
      /INCEPTION_API_KEY_FALLBACK/,
    );
  });

  it("prefers primary then fallback for primary selector", () => {
    process.env.INCEPTION_API_KEY = "primary-key";
    process.env.INCEPTION_API_KEY_FALLBACK = "fallback-key";

    expect(resolveApiKeys("primary")).toEqual(["primary-key", "fallback-key"]);
  });

  it("deduplicates identical primary and fallback keys", () => {
    process.env.INCEPTION_API_KEY = "same-key";
    process.env.INCEPTION_API_KEY_FALLBACK = "same-key";

    expect(resolveApiKeys("primary")).toEqual(["same-key"]);
  });
});
