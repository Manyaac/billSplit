import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../middleware/auth.js";

const router = Router();

// Assign friends to a bill item (itemized split tagging)
router.patch("/:itemId/assign", requireAuth, async (req: AuthRequest, res) => {
  const itemId = req.params.itemId;
  const { friendIds } = req.body;

  if (!itemId || typeof itemId !== "string") {
    return res.status(400).json({ error: "Invalid item id" });
  }

  if (!Array.isArray(friendIds)) {
    return res.status(400).json({ error: "friendIds must be an array" });
  }

  try {
    // Confirm the item's bill belongs to the logged-in user
    const item = await prisma.billItem.findUnique({
      where: { id: itemId },
      include: { bill: true },
    });

    if (!item || item.bill.ownerId !== req.userId) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Confirm all friendIds actually belong to this user (prevent tagging someone else's friend)
    const validFriends = await prisma.friend.findMany({
      where: { id: { in: friendIds }, ownerId: req.userId },
    });

    if (validFriends.length !== friendIds.length) {
      return res.status(400).json({ error: "One or more friendIds are invalid" });
    }

    const updated = await prisma.billItem.update({
      where: { id: itemId },
      data: {
        assignedTo: {
          set: friendIds.map((id: string) => ({ id })),
        },
      },
      include: { assignedTo: true },
    });

    res.status(200).json(updated);
  } catch (err) {
    console.error("Assign item error:", err);
    res.status(500).json({ error: "Failed to assign item" });
  }
});

export default router;