import { z } from "zod";

export const createBillSchema = z.object({
  title: z.string().min(1).optional(),
  imageUrl: z.string().url().optional(),
  totalAmount: z.number().positive(),
  splitMode: z.enum(["EQUAL", "ITEMIZED"]),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        price: z.number().nonnegative(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1, "At least one item is required"),
});

export const splitBillSchema = z.object({
  friendIds: z.array(z.string().uuid()).optional(),
  peopleCount: z.number().int().positive().optional(),
});