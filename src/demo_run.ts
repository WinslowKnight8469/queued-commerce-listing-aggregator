import { checkout, fulfill } from "./order_workflow.js";

const order = checkout({
  customerId: "reader-42",
  email: "reader@example.com",
  sku: "FIELD-RECORDER",
  listings: [
    { sku: "FIELD-RECORDER", title: "Pocket field recorder", sourceUrl: "https://shop-a.example/recorder", priceCents: 12900, available: true },
    { sku: "FIELD-RECORDER", title: "Pocket field recorder", sourceUrl: "https://shop-b.example/audio/recorder", priceCents: 12400, available: true },
  ],
  shippingAddress: { line1: "12 Studio Lane", city: "Austin", postalCode: "78701", country: "US" },
});

console.log(JSON.stringify(fulfill(order, "Parcel Post", "PP-2048"), null, 2));
