import { describe, expect, it } from "vitest";
import { looksTruncated } from "./answer-quality";

describe("looksTruncated", () => {
  it("flags colon-terminated short answers", () => {
    expect(
      looksTruncated(
        "Set a larger timeout for the proxy so the connection isn't closed after 30 seconds. In your nginx location block for the websocket, add or increase:",
      ),
    ).toBe(true);
  });

  it("accepts complete nginx guidance", () => {
    expect(
      looksTruncated(
        "Raise proxy timeouts in nginx.\n\n```nginx\nproxy_read_timeout 3600s;\nproxy_send_timeout 3600s;\n```",
      ),
    ).toBe(false);
  });
});
