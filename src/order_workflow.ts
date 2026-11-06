import { randomUUID } from "node:crypto";
import { z } from "zod";

export const ListingSchema = z.object({
  sku: z.string().min(1),
  title: z.string().min(1),
  sourceUrl: z.string().url(),
  priceCents: z.number().int().nonnegative(),
  available: z.boolean(),
});

export const CheckoutSchema = z.object({
  customerId: z.string().min(1),
  email: z.string().email(),
  sku: z.string().min(1),
  listings: z.array(ListingSchema).min(1),
  shippingAddress: z.object({
    line1: z.string().min(1),
    city: z.string().min(1),
    postalCode: z.string().min(1),
    country: z.string().length(2),
  }),
});

export type Listing = z.infer<typeof ListingSchema>;
export type CheckoutInput = z.infer<typeof CheckoutSchema>;

export type Order = {
  orderId: string;
  customerId: string;
  email: string;
  selectedListing: Listing;
  status: "confirmed" | "fulfilled";
  fulfillment?: { carrier: string; trackingCode: string };
  receipt: { receiptId: string; totalCents: number };
  updates: Array<{ status: string; message: string }>;
};

export function chooseListing(listings: Listing[], sku: string): Listing {
  const candidates = listings
    .filter((listing) => listing.sku === sku && listing.available)
    .sort((left, right) =>
      left.priceCents - right.priceCents || left.sourceUrl.localeCompare(right.sourceUrl),
    );
  if (!candidates[0]) throw new Error(`No fulfillable listing for ${sku}`);
  return candidates[0];
}

export function checkout(input: CheckoutInput): Order {
  const selectedListing = chooseListing(input.listings, input.sku);
  return {
    orderId: randomUUID(),
    customerId: input.customerId,
    email: input.email,
    selectedListing,
    status: "confirmed",
    receipt: { receiptId: randomUUID(), totalCents: selectedListing.priceCents },
    updates: [{ status: "confirmed", message: `Order confirmed from ${selectedListing.sourceUrl}` }],
  };
}

export function fulfill(order: Order, carrier: string, trackingCode: string): Order {
  return {
    ...order,
    status: "fulfilled",
    fulfillment: { carrier, trackingCode },
    updates: [...order.updates, { status: "fulfilled", message: `Shipped with ${carrier}` }],
  };
}
