import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../middleware/auth.js";

const router = Router();

// Mark a split as paid (and reduce the friend's balance accordingly)
router.patch("/:id/pay", requireAuth, async (req: AuthRequest, res) => {
  const splitId = req.params.id;

  if (!splitId || typeof splitId !== "string") {
    return res.status(400).json({ error: "Invalid split id" });
  }

  try {
    const split = await prisma.split.findUnique({
      where: { id: splitId },
      include: { bill: true },
    });

    if (!split || split.bill.ownerId !== req.userId) {
      return res.status(404).json({ error: "Split not found" });
    }

    if (split.paid) {
      return res.status(400).json({ error: "Split is already marked as paid" });
    }

    const [updatedSplit] = await prisma.$transaction([
      prisma.split.update({
        where: { id: splitId },
        data: { paid: true, paidAt: new Date() },
      }),
      prisma.friend.update({
        where: { id: split.friendId },
        data: { balanceOwed: { decrement: split.amountOwed } },
      }),
    ]);

    res.status(200).json(updatedSplit);
  } catch (err) {
    console.error("Mark paid error:", err);
    res.status(500).json({ error: "Failed to mark split as paid" });
  }
});

// Remove a single split (undo one friend's split, revert their balance)
router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const splitId = req.params.id;
  if (!splitId || typeof splitId !== "string") {
    return res.status(400).json({ error: "Invalid split id" });
  }

  try {
    const split = await prisma.split.findUnique({
      where: { id: splitId },
      include: { bill: { include: { items: { include: { assignedTo: true } }, splits: true } } },
    });

    if (!split || split.bill.ownerId !== req.userId) {
      return res.status(404).json({ error: "Split not found" });
    }

    const bill = split.bill;
    const removedFriendId = split.friendId;

    await prisma.$transaction(async (tx) => {
      if (!split.paid) {
        await tx.friend.update({
          where: { id: removedFriendId },
          data: { balanceOwed: { decrement: split.amountOwed } },
        });
      }
      await tx.split.delete({ where: { id: splitId } });

      if (bill.splitMode === "ITEMIZED") {
        for (const item of bill.items) {
          if (item.assignedTo.some((a) => a.id === removedFriendId)) {
            await tx.billItem.update({
              where: { id: item.id },
              data: { assignedTo: { disconnect: { id: removedFriendId } } },
            });
          }
        }
      }

      const remainingSplits = bill.splits.filter((s) => s.id !== splitId);
      const owedMap: Record<string, number> = {};

      if (bill.splitMode === "EQUAL") {
        const remainingFriendIds = remainingSplits.map((s) => s.friendId);
        const divisor = bill.equalSplitCount ?? remainingFriendIds.length;
        for (const fid of remainingFriendIds) {
          owedMap[fid] = bill.totalAmount / divisor;
        }
      }
        
        else {
        const freshItems = await tx.billItem.findMany({
          where: { billId: bill.id },
          include: { assignedTo: true },
        });
        for (const item of freshItems) {
          if (item.assignedTo.length === 0) continue;
          const itemTotal = item.price * item.quantity;
          const perPerson = itemTotal / item.assignedTo.length;
          for (const friend of item.assignedTo) {
            owedMap[friend.id] = (owedMap[friend.id] || 0) + perPerson;
          }
        }
      }

      for (const s of remainingSplits) {
        const newAmount = owedMap[s.friendId] ?? 0;
        if (!s.paid) {
          await tx.friend.update({
            where: { id: s.friendId },
            data: { balanceOwed: { increment: newAmount - s.amountOwed } },
          });
          await tx.split.update({ where: { id: s.id }, data: { amountOwed: newAmount } });
        }
      }
    });

    res.status(200).json({ message: "Split removed and remaining splits recalculated" });
  } catch (err) {
    console.error("Delete split error:", err);
    res.status(500).json({ error: "Failed to remove split" });
  }
});

export default router;