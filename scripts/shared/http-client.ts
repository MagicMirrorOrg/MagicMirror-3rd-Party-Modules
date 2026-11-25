import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";

import type { RateLimiter } from "./rate-limiter.ts";

export interface HttpHeaders {
  [key: string]: string | undefined;
}

export interface HttpResponse<TData = unknown> {
  data: TData;
  headers: Headers;
  ok: boolean;
  status: number;
}

export interface CreateHttpClientOptions {
  defaultHeaders?: HttpHeaders;
  maxRetries?: number;
  rateLimiter?: RateLimiter | null;
  retryBackoffMs?: number;
  userAgent?: string;
}

interface PerformRequestOptions {
  body?: string | ArrayBuffer | URLSearchParams | null;
  headers?: HttpHeaders;
  method?: string;
  retryDelayMs?: number;
  retries?: number;
  signal?: AbortSignal;
  [key: string]: unknown;
}

export interface HttpClient {
  getJson: <TData = unknown>(url: string, options?: PerformRequestOptions) => Promise<HttpResponse<TData>>;
  getText: (url: string, options?: PerformRequestOptions) => Promise<HttpResponse<string>>;
  request: (url: string, options?: PerformRequestOptions) => Promise<Response>;
  withDefaults: (overrides: CreateHttpClientOptions) => HttpClient;
}

export interface AuthHeaders {
  Authorization?: string;
  [key: string]: string | undefined;
}

const DEFAULT_USER_AGENT = "MagicMirror-Pipeline/0.1 (+https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules)";
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_RETRY_BACKOFF_MS = 1500;

function buildHeaders(baseHeaders: HttpHeaders = {}, overrides: HttpHeaders = {}): HttpHeaders {
  const normalizedBase = { ...baseHeaders };
  const merged = { ...normalizedBase, ...overrides };
  const pairs = Object.entries(merged)
    .filter(entry => typeof entry[1] !== "undefined" && entry[1] !== null)
    .map((entry) => {
      const [key, value] = entry;
      return [key.toLowerCase() === "user-agent" ? "user-agent" : key, value];
    });

  return Object.fromEntries(pairs);
}

export function createHttpClient(config: CreateHttpClientOptions = {}): HttpClient {
  const {
    userAgent = DEFAULT_USER_AGENT,
    defaultHeaders = {},
    rateLimiter,
    maxRetries = DEFAULT_RETRY_COUNT,
    retryBackoffMs = DEFAULT_RETRY_BACKOFF_MS
  } = config;
  const mergedDefaults = buildHeaders({ "user-agent": userAgent }, defaultHeaders);

  async function performRequest(url: string, options: PerformRequestOptions = {}): Promise<Response> {
    const {
      method = "GET",
      headers = {},
      body,
      signal,
      retries = maxRetries,
      retryDelayMs = retryBackoffMs,
      ...fetchOverrides
    } = options;
    const mergedHeaders = buildHeaders(mergedDefaults, headers);

    const execute = async () => {
      const response = await fetch(url, {
        method,
        headers: mergedHeaders,
        body,
        signal,
        ...fetchOverrides
      });
      return response;
    };

    let attempt = 0;

    while (true) {
      if (rateLimiter) {
        await rateLimiter.acquire();
      }

      try {
        const response = await execute();

        if (response.ok || attempt >= retries || !shouldRetry(response.status)) {
          return response;
        }

        attempt += 1;
        const retryAfterHeader = response.headers.get("retry-after");
        let delayMs = retryDelayMs * attempt;

        if (retryAfterHeader) {
          const seconds = Number(retryAfterHeader);
          if (Number.isNaN(seconds)) {
            const date = Date.parse(retryAfterHeader);
            if (Number.isNaN(date)) {
              // Invalid date, ignore
            }
            else {
              delayMs = Math.max(0, date - Date.now());
            }
          }
          else {
            delayMs = seconds * 1000;
          }
        }

        await delay(delayMs, null, { signal });
      }
      catch (error) {
        if (attempt >= retries || (signal?.aborted ?? false)) {
          throw error;
        }
        attempt += 1;
        const delayMs = retryDelayMs * attempt;
        await delay(delayMs, null, { signal });
      }
    }
  }

  async function requestJson<TData = unknown>(url: string, options: PerformRequestOptions = {}): Promise<HttpResponse<TData>> {
    const response = await performRequest(url, options);
    const text = await response.text();
    try {
      const parsed: TData = text.length > 0 ? JSON.parse(text) : null;
      return {
        status: response.status,
        ok: response.ok,
        data: parsed,
        headers: response.headers
      };
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const err = new Error(`Failed to parse JSON from ${url} (HTTP ${response.status}): ${message}`);
      err.cause = error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err as any).responseText = text;
      throw err;
    }
  }

  async function requestText(url: string, options: PerformRequestOptions = {}): Promise<HttpResponse<string>> {
    const response = await performRequest(url, options);
    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      data: text,
      headers: response.headers
    };
  }

  return {
    request: performRequest,
    getJson: requestJson,
    getText: requestText,
    withDefaults(overrides) {
      return createHttpClient({
        userAgent,
        defaultHeaders: buildHeaders(mergedDefaults, overrides.defaultHeaders ?? {}),
        rateLimiter: overrides.rateLimiter ?? rateLimiter,
        maxRetries: overrides.maxRetries ?? maxRetries,
        retryBackoffMs: overrides.retryBackoffMs ?? retryBackoffMs
      });
    }
  };
}

function shouldRetry(status: number): boolean {
  if (status >= 500) {
    return true;
  }

  if (status === 429) {
    return true;
  }

  return false;
}

export function buildAuthHeadersFromEnv(env: NodeJS.ProcessEnv = process.env): AuthHeaders {
  if (env.GITHUB_TOKEN) {
    return {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`
    };
  }

  return {};
}
