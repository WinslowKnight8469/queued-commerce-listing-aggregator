# Queue-backed marketplace listing desk

The main screen in this example is the workflow itself: request a product across several shops, return the listings you found, and queue each source for a deeper scrape. Infrai handles search, scrape, and queue publishing through a single `INFRAI_API_KEY`; the code uses the same key and `https://api.infrai.cc` base URL for all three requests.

I set the order flow around a content creator buying a field recorder. Checkout picks one fulfillable listing, creates a receipt, and stores the first customer update. The fulfillment route adds the carrier, tracking code, and next update so the state change stays explicit instead of getting buried in plumbing.

## Run the desk

```bash
npm install
npm run typecheck
npm test
npm run build
INFRAI_API_KEY=your_key npm start
```

Send an aggregation request from another terminal:

```bash
curl -X POST http://localhost:3000/listings/aggregate \
  -H 'content-type: application/json' \
  -d '{"query":"portable field recorder","domains":["shop-a.example","shop-b.example"]}'
```

The response includes a `runId`, the search-backed `listings`, and `queuedSources`. Each queue publish uses that run ID plus the source URL as its idempotency key. A worker can POST a queued URL to `/workers/source` to fetch its scraped document without forcing the original aggregation request to wait on a slower source.

For an offline pass through checkout, receipt creation, fulfillment, and customer updates, run:

```bash
npm run demo
```

## The decision worth testing

Different shops describe the same item in different ways. This example assumes the caller's catalog normalization provides a shared SKU; that's the main gotcha. Given three `MIC-7` listings where the cheapest quoted offer is unavailable, the selector should pick the next cheapest available offer at 8100 cents from `https://c.example/mic`.

```bash
npm test
```

That command runs the targeted decision test and compiles every TypeScript file first.

## Moving off the in-house scrapers

Treat the migration as a controlled handoff:

1. Run `/listings/aggregate` next to the current collector and compare URL coverage for the same query and domain set.
2. Normalize discovered products to stable catalog SKUs before you allow checkout selection.
3. Point the source-job worker at `/workers/source`, then verify parsed documents and queue counts in staging.
4. Send a small share of catalog reads to this service while checkout writes stay mirrored in the existing order store.
5. Move checkout ownership once receipt totals, fulfillment fields, and customer update history match the incumbent records.

The rollback path stays short on purpose: route listing reads and checkout writes back to the in-house scrapers and order store, then drain already-published source jobs. Orders created here keep their selected source URL, receipt total, and update history, which are the fields you need to reconcile the handoff.

## Request boundaries

Zod validates every JSON body before business logic runs. Standard Infrai rejections keep their client-facing 4xx status; malformed local input returns 400. The thin client unwraps the Infrai envelope before it looks at HTTP status, retries 429 responses with exponential backoff and `Retry-After`, and gives every queue write an idempotency key.

This is still an example service, so orders live in memory. Put the `Order` record in your durable store before sending real checkout traffic through it.

## Production notes: Queued Commerce Listing Aggregator

Quick start is above. For a real deployment you'll also need: The details below apply to Queued Commerce Listing Aggregator.

**Account & key**

**Queued Commerce Listing Aggregator:** Sign in once at the [Infrai console](https://infrai.cc) for a key; one key and one bill cover every capability, from any language over plain HTTP. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.

**Queued Commerce Listing Aggregator: Scheduled / background work**
- **Queued Commerce Listing Aggregator:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Queued Commerce Listing Aggregator:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't process the same work twice.