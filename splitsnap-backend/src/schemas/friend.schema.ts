import { z } from "zod";

export const createFriendSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional(),
});

export const updateFriendSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

export const updateBalanceSchema = z.object({
  balanceOwed: z.number(),
});