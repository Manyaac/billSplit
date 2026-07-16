import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../middleware/auth.js";

const router = Router();

// Create a bill from parsed receipt data
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { title, imageUrl, totalAmount, splitMode, items } = req.body;

  if (!totalAmount || !splitMode || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: "totalAmount, splitMode, and a non-empty items array are required",
    });
  }

  try {
    const bill = await prisma.bill.create({
      data: {
        title: title || null,
        imageUrl: imageUrl || null,
        totalAmount,
        splitMode,
        ownerId: req.userId!,
        items: {
          create: items.map((item: { name: string; price: number; quantity: number }) => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    res.status(201).json(bill);
  } catch (err) {
    console.error("Create bill error:", err);
    res.status(500).json({ error: "Failed to create bill" });
  }
});

// Get all bills for the logged-in user
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const bills = await prisma.bill.findMany({
      where: { ownerId: req.userId! },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(bills);
  } catch (err) {
    console.error("Fetch bills error:", err);
    res.status(500).json({ error: "Failed to fetch bills" });
  }
});

// Get a single bill by ID (only if owned by the logged-in user)
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const billId = req.params.id;
  if (!billId || typeof billId !== "string") {
    return res.status(400).json({ error: "Invalid bill id" });
  }

  try {
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: { items: true, splits: true },
    });

    if (!bill || bill.ownerId !== req.userId) {
      return res.status(404).json({ error: "Bill not found" });
    }

    res.status(200).json(bill);
  } catch (err) {
    console.error("Fetch bill error:", err);
    res.status(500).json({ error: "Failed to fetch bill" });
  }
});


// Calculate and save splits for a bill
router.post("/:id/split", requireAuth, async (req: AuthRequest, res) => {
  const billId = req.params.id;
  const { friendIds } = req.body ?? {}; // only needed for EQUAL mode

  if (!billId || typeof billId !== "string") {
    return res.status(400).json({ error: "Invalid bill id" });
  }

  try {
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: { items: { include: { assignedTo: true } } },
    });

    if (!bill || bill.ownerId !== req.userId) {
      return res.status(404).json({ error: "Bill not found" });
    }

    // Map of friendId -> amount owed
    const owedMap: Record<string, number> = {};

    if (bill.splitMode === "EQUAL") {
      if (!Array.isArray(friendIds) || friendIds.length === 0) {
        return res.status(400).json({ error: "friendIds required for EQUAL split" });
      }

      const validFriends = await prisma.friend.findMany({
        where: { id: { in: friendIds }, ownerId: req.userId },
      });

      if (validFriends.length !== friendIds.length) {
        return res.status(400).json({ error: "One or more friendIds are invalid" });
      }

      const share = bill.totalAmount / friendIds.length;
      for (const fid of friendIds) {
        owedMap[fid] = share;
      }
    } else {
      // ITEMIZED — sum each item's (price * quantity) split across its assigned friends
      for (const item of bill.items) {
        if (item.assignedTo.length === 0) continue; // unassigned items are skipped
        const itemTotal = item.price * item.quantity;
        const perPerson = itemTotal / item.assignedTo.length;

        for (const friend of item.assignedTo) {
          owedMap[friend.id] = (owedMap[friend.id] || 0) + perPerson;
        }
      }

      if (Object.keys(owedMap).length === 0) {
        return res.status(400).json({ error: "No items have been assigned to friends yet" });
      }
    }

    // Save Split rows + bump each friend's running balance, all in one transaction
    const result = await prisma.$transaction(async (tx) => {
      const splits = [];
      for (const [friendId, amount] of Object.entries(owedMap)) {
        const split = await tx.split.create({
          data: { billId: bill.id, friendId, amountOwed: amount },
        });
        await tx.friend.update({
          where: { id: friendId },
          data: { balanceOwed: { increment: amount } },
        });
        splits.push(split);
      }
      return splits;
    });

    res.status(200).json({ splits: result });
  } catch (err) {
    console.error("Split bill error:", err);
    res.status(500).json({ error: "Failed to split bill" });
  }
});

export default router;