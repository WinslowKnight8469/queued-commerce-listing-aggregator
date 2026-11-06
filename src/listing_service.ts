import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiError, newRunId, queueSource, scrapeListing, searchListings } from "./infrai_client.js";
import { CheckoutSchema, checkout, fulfill, type Order } from "./order_workflow.js";

const AggregateSchema = z.object({
  query: z.string().min(2),
  domains: z.array(z.string().min(1)).min(2).max(8),
});
const FulfillSchema = z.object({ carrier: z.string().min(1), trackingCode: z.string().min(1) });
const WorkerSchema = z.object({ url: z.string().url() });
const orders = new Map<string, Order>();

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readJson(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/listings/aggregate") {
      const input = AggregateSchema.parse(await readJson(request));
      const runId = newRunId();
      const data = await searchListings(input.query, input.domains);
      await Promise.all(data.results.map((result) => queueSource(
        { runId, url: result.url, query: input.query },
        runId,
        result.url,
      )));
      send(response, 202, { runId, listings: data.results, queuedSources: data.results.length });
      return;
    }

    if (request.method === "POST" && request.url === "/workers/source") {
      const input = WorkerSchema.parse(await readJson(request));
      send(response, 200, { url: input.url, document: await scrapeListing(input.url) });
      return;
    }

    if (request.method === "POST" && request.url === "/orders/checkout") {
      const order = checkout(CheckoutSchema.parse(await readJson(request)));
      orders.set(order.orderId, order);
      send(response, 201, order);
      return;
    }

    const fulfillmentMatch = request.url?.match(/^\/orders\/([^/]+)\/fulfillment$/);
    if (request.method === "POST" && fulfillmentMatch) {
      const order = orders.get(fulfillmentMatch[1]);
      if (!order) {
        send(response, 404, { error: "Order not found" });
        return;
      }
      const input = FulfillSchema.parse(await readJson(request));
      const updated = fulfill(order, input.carrier, input.trackingCode);
      orders.set(updated.orderId, updated);
      send(response, 200, updated);
      return;
    }

    const orderMatch = request.url?.match(/^\/orders\/([^/]+)$/);
    if (request.method === "GET" && orderMatch) {
      const order = orders.get(orderMatch[1]);
      send(response, order ? 200 : 404, order ?? { error: "Order not found" });
      return;
    }
    send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      send(response, 400, { error: "Invalid request", issues: error.issues });
    } else if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, details: error.details });
    } else {
      send(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" });
    }
  }
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`Listing service listening on http://localhost:${port}`));
}
