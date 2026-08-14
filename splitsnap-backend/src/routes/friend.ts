import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createFriendSchema, updateFriendSchema, updateBalanceSchema } from "../schemas/friend.schema.js";

const router = Router();

// Add a friend
router.post("/", requireAuth, validate(createFriendSchema), async (req: AuthRequest, res) => {
  const { name, email } = req.body;

  try {
    const existing = await prisma.friend.findFirst({
      where: {
        ownerId: req.userId!,
        name: { equals: name, mode: "insensitive" },
      },
    });

    if (existing) {
      return res.status(409).json({ error: `${name} is already in your friends list` });
    }

    const friend = await prisma.friend.create({
      data: {
        name,
        email: email || null,
        ownerId: req.userId!,
      },
    });
    res.status(201).json(friend);
  } catch (err) {
    console.error("Create friend error:", err);
    res.status(500).json({ error: "Failed to create friend" });
  }
});

// Get all friends for the logged-in user
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const friends = await prisma.friend.findMany({
      where: { ownerId: req.userId! },
      orderBy: { name: "asc" },
    });
    res.status(200).json(friends);
  } catch (err) {
    console.error("Fetch friends error:", err);
    res.status(500).json({ error: "Failed to fetch friends" });
  }
});

// Delete a friend
router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const friendId = req.params.id;
  if (!friendId || typeof friendId !== "string") {
    return res.status(400).json({ error: "Invalid friend id" });
  }

  try {
    const friend = await prisma.friend.findUnique({ where: { id: friendId } });

    if (!friend || friend.ownerId !== req.userId) {
      return res.status(404).json({ error: "Friend not found" });
    }

    await prisma.friend.delete({ where: { id: friendId } });
    res.status(200).json({ message: "Friend deleted" });
  } catch (err) {
    console.error("Delete friend error:", err);
    res.status(500).json({ error: "Failed to delete friend" });
  }
});

// Manually adjust a friend's balance (e.g. correcting for a cash payback)
router.patch("/:id/balance", requireAuth, validate(updateBalanceSchema), async (req: AuthRequest, res) => {
  const friendId = req.params.id;
  const { balanceOwed } = req.body;

  if (!friendId || typeof friendId !== "string") {
    return res.status(400).json({ error: "Invalid friend id" });
  }

  try {
    const friend = await prisma.friend.findUnique({ where: { id: friendId } });

    if (!friend || friend.ownerId !== req.userId) {
      return res.status(404).json({ error: "Friend not found" });
    }

    const updated = await prisma.friend.update({
      where: { id: friendId },
      data: { balanceOwed },
    });

    res.status(200).json(updated);
  } catch (err) {
    console.error("Update balance error:", err);
    res.status(500).json({ error: "Failed to update balance" });
  }
});

// Update a friend's name/email
router.patch("/:id", requireAuth, validate(updateFriendSchema), async (req: AuthRequest, res) => {
  const friendId = req.params.id;
  const { name, email } = req.body;

  if (!friendId || typeof friendId !== "string") {
    return res.status(400).json({ error: "Invalid friend id" });
  }

  try {
    const friend = await prisma.friend.findUnique({ where: { id: friendId } });

    if (!friend || friend.ownerId !== req.userId) {
      return res.status(404).json({ error: "Friend not found" });
    }

    const updated = await prisma.friend.update({
      where: { id: friendId },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
      },
    });

    res.status(200).json(updated);
  } catch (err) {
    console.error("Update friend error:", err);
    res.status(500).json({ error: "Failed to update friend" });
  }
});

export default router;