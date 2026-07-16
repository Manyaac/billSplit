import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../middleware/auth.js";

const router = Router();

// Add a friend
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { name } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required" });
  }

  try {
    const friend = await prisma.friend.create({
      data: {
        name,
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
router.patch("/:id/balance", requireAuth, async (req: AuthRequest, res) => {
  const friendId = req.params.id;
  const { balanceOwed } = req.body;

  if (!friendId || typeof friendId !== "string") {
    return res.status(400).json({ error: "Invalid friend id" });
  }

  if (typeof balanceOwed !== "number") {
    return res.status(400).json({ error: "balanceOwed must be a number" });
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

export default router;