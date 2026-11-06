import assert from "node:assert/strict";
import test from "node:test";
import { chooseListing } from "./order_workflow.js";

test("chooses the lowest-priced fulfillable source for a shared SKU", () => {
  const selected = chooseListing([
    { sku: "MIC-7", title: "Creator microphone", sourceUrl: "https://a.example/mic", priceCents: 8900, available: true },
    { sku: "MIC-7", title: "Creator microphone", sourceUrl: "https://b.example/mic", priceCents: 7200, available: false },
    { sku: "MIC-7", title: "Creator microphone", sourceUrl: "https://c.example/mic", priceCents: 8100, available: true },
  ], "MIC-7");

  assert.equal(selected.sourceUrl, "https://c.example/mic");
  assert.equal(selected.priceCents, 8100);
});
