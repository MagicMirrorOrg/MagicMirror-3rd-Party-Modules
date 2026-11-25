import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert";
import { createHttpClient } from "../http-client.ts";

describe("HttpClient", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  });

  it("should retry on 503", async () => {
    let calls = 0;
    globalThis.fetch = mock.fn(() => {
      calls += 1;
      if (calls < 3) {
        return Promise.resolve({
          ok: false,
          status: 503,
          headers: new Map(),
          text: () => Promise.resolve("Service Unavailable")
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve("Success")
      });
    });

    const client = createHttpClient({ retryBackoffMs: 10 });
    const response = await client.request("https://example.com");

    assert.strictEqual(response.status, 200);
    assert.strictEqual(calls, 3);
  });

  it("should respect Retry-After header (seconds)", async () => {
    let calls = 0;
    const start = Date.now();
    globalThis.fetch = mock.fn(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: new Map([["retry-after", "1"]]), // 1 second
          text: () => Promise.resolve("Too Many Requests")
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve("Success")
      });
    });

    const client = createHttpClient({ retryBackoffMs: 10 });
    const response = await client.request("https://example.com");

    const duration = Date.now() - start;
    assert.strictEqual(response.status, 200);
    assert.strictEqual(calls, 2);
    // Allow some buffer for execution time, but it should be at least close to 1000ms
    assert.ok(duration >= 900, `Duration ${duration}ms should be >= 900ms`);
  });

  it("should respect Retry-After header (date)", async () => {
    let calls = 0;
    const start = Date.now();
    // Use 2 seconds to avoid issues with second truncation in toUTCString
    const retryDate = new Date(Date.now() + 2000).toUTCString();

    globalThis.fetch = mock.fn(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: new Map([["retry-after", retryDate]]),
          text: () => Promise.resolve("Too Many Requests")
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve("Success")
      });
    });

    const client = createHttpClient({ retryBackoffMs: 10 });
    const response = await client.request("https://example.com");

    const duration = Date.now() - start;
    assert.strictEqual(response.status, 200);
    assert.strictEqual(calls, 2);
    // Should wait at least 1 second (since we added 2 seconds, and lost up to 1 second due to truncation)
    assert.ok(duration >= 900, `Duration ${duration}ms should be >= 900ms`);
  });

  it("should stop retrying after maxRetries", async () => {
    let calls = 0;
    globalThis.fetch = mock.fn(() => {
      calls += 1;
      return Promise.resolve({
        ok: false,
        status: 503,
        headers: new Map(),
        text: () => Promise.resolve("Service Unavailable")
      });
    });

    const client = createHttpClient({ maxRetries: 2, retryBackoffMs: 10 });
    const response = await client.request("https://example.com");

    assert.strictEqual(response.status, 503);
    assert.strictEqual(calls, 3); // Initial + 2 retries
  });

  it("includes the HTTP status when a JSON response is invalid", async () => {
    globalThis.fetch = mock.fn(() => Promise.resolve(new Response("<html>error</html>", { status: 502 })));
    const client = createHttpClient({ maxRetries: 0 });

    await assert.rejects(client.getJson("https://example.com"), /Failed to parse JSON from https:\/\/example\.com \(HTTP 502\)/u);
  });
});
