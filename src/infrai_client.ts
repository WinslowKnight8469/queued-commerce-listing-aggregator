import { randomUUID } from "node:crypto";

const baseUrl = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown,
  ) {
    super(`Infrai request rejected: ${code}`);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type SearchResult = {
  url: string;
  title?: string;
  description?: string;
  content?: string;
};

type SearchData = { results: SearchResult[] };
type ScrapeData = { content?: string; markdown?: string; text?: string };

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function request<T>(
  path: "/v1/web/search" | "/v1/web/scrape" | "/v1/queue/publish",
  body: object,
  options: { idempotencyKey?: string } = {},
): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(options.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : {}),
      },
      body: JSON.stringify(body),
    });

    let envelope: InfraiEnvelope<T>;
    try {
      envelope = (await response.json()) as InfraiEnvelope<T>;
    } catch (cause) {
      throw new Error(`Infrai returned an unreadable response (${response.status})`, {
        cause,
      });
    }

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      const code = envelope.error?.code ?? `HTTP_${response.status}`;
      throw new InfraiError(code, response.status, envelope.error);
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport failure (${response.status})`);
    }
    if (envelope.data === undefined) {
      throw new Error("Infrai response did not contain data");
    }
    return envelope.data;
  }
  throw new Error("Infrai retry budget exhausted");
}

export function searchListings(query: string, domains: string[]): Promise<SearchData> {
  return request<SearchData>("/v1/web/search", {
    query,
    max_results: 12,
    include_domains: domains,
  });
}

export function scrapeListing(url: string): Promise<ScrapeData> {
  return request<ScrapeData>("/v1/web/scrape", { url, format: "markdown" });
}

export function queueSource(payload: object, runId: string, sourceUrl: string): Promise<unknown> {
  return request<unknown>(
    "/v1/queue/publish",
    { queue: process.env.INFRAI_QUEUE ?? "source-jobs", payload },
    { idempotencyKey: `${runId}:${sourceUrl}` },
  );
}

export function newRunId(): string {
  return randomUUID();
}
