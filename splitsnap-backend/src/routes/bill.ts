import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../middleware/auth.js";
import { resend } from "../lib/resend.js";
import { validate } from "../middleware/validate.js";
import { createBillSchema, splitBillSchema } from "../schemas/bill.schema.js";

const router = Router();

// Create a bill from parsed receipt data
router.post("/", requireAuth, validate(createBillSchema), async (req: AuthRequest, res) => {
  const { title, imageUrl, totalAmount, splitMode, items } = req.body;

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
      include: { items: { include: { assignedTo: true } }, splits: true },
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
router.post("/:id/split", requireAuth, validate(splitBillSchema), async (req: AuthRequest, res) => {
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
      const { peopleCount } = req.body;

      if (!peopleCount || typeof peopleCount !== "number") {
        return res.status(400).json({ error: "peopleCount is required for EQUAL split" });
      }

      const namedFriendIds = Array.isArray(friendIds) ? friendIds : [];

      if (namedFriendIds.length > 0) {
        const validFriends = await prisma.friend.findMany({
          where: { id: { in: namedFriendIds }, ownerId: req.userId },
        });
        if (validFriends.length !== namedFriendIds.length) {
          return res.status(400).json({ error: "One or more friendIds are invalid" });
        }
      }

      const share = bill.totalAmount / peopleCount;
      for (const fid of namedFriendIds) {
        owedMap[fid] = share;
      }

      await prisma.bill.update({ where: { id: bill.id }, data: { equalSplitCount: peopleCount } });
    }

      else {
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
    // Save Split rows + bump each friend's running balance, all in one transaction
    const result = await prisma.$transaction(async (tx) => {
      const splits: any[] = [];
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

    // Send reminder emails to friends + a log email to the owner (best-effort, non-blocking)
    const owner = await prisma.user.findUnique({ where: { id: req.userId! } });
    const friendsInvolved = await prisma.friend.findMany({
      where: { id: { in: Object.keys(owedMap) } },
    });

    for (const friend of friendsInvolved) {
      const amount = owedMap[friend.id] ?? 0;
      if (friend.email) {
        try {
          await resend.emails.send({
            from: "onboarding@resend.dev",
            to: friend.email,
            subject: `You owe ₹${amount.toFixed(2)} for "${bill.title || "a bill"}"`,
            html: `<p>Hi ${friend.name}, you owe <strong>₹${amount.toFixed(2)}</strong> for "${bill.title || "a bill"}" split with ${owner?.username || "your friend"} on SplitSnap.</p>`,
          });
        } catch (emailErr) {
          console.error(`Reminder email to ${friend.name} failed:`, emailErr);
        }
      }
    }
    if (owner?.email) {
      const summaryLines = friendsInvolved
        .map((f) => `<li>${f.name}: ₹${(owedMap[f.id] ?? 0).toFixed(2)}</li>`)
        .join("");
      try {
        await resend.emails.send({
          from: "onboarding@resend.dev",
          to: owner.email,
          subject: `Split logged for "${bill.title || "a bill"}"`,
          html: `<p>You split "${bill.title || "a bill"}" (₹${bill.totalAmount.toFixed(2)}) as follows:</p><ul>${summaryLines}</ul>`,
        });
      } catch (emailErr) {
        console.error("Owner log email failed:", emailErr);
      }
    }

    res.status(200).json({ splits: result });
  } catch (err) {
    console.error("Split bill error:", err);
    res.status(500).json({ error: "Failed to split bill" });
  }
});


// Cancel all splits on a bill (revert balances, allow re-splitting)
router.delete("/:id/split", requireAuth, async (req: AuthRequest, res) => {
  const billId = req.params.id;

  if (!billId || typeof billId !== "string") {
    return res.status(400).json({ error: "Invalid bill id" });
  }

  try {
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: { splits: true },
    });

    if (!bill || bill.ownerId !== req.userId) {
      return res.status(404).json({ error: "Bill not found" });
    }

    await prisma.$transaction(async (tx) => {
      for (const split of bill.splits) {
        if (!split.paid) {
          await tx.friend.update({
            where: { id: split.friendId },
            data: { balanceOwed: { decrement: split.amountOwed } },
          });
        }
      }
      await tx.split.deleteMany({ where: { billId } });
    });

    res.status(200).json({ message: "Splits cancelled" });
  } catch (err) {
    console.error("Cancel split error:", err);
    res.status(500).json({ error: "Failed to cancel splits" });
  }
});

// Change a bill's split mode — only allowed before any split has been created
router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const billId = req.params.id;
  const { splitMode, title } = req.body;

  if (!billId || typeof billId !== "string") {
    return res.status(400).json({ error: "Invalid bill id" });
  }
  if (splitMode && !["EQUAL", "ITEMIZED"].includes(splitMode)) {
    return res.status(400).json({ error: "splitMode must be EQUAL or ITEMIZED" });
  }

  

  try {
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: { splits: true },
    });

    if (!bill || bill.ownerId !== req.userId) {
  return res.status(404).json({ error: "Bill not found" });
}

    if (title !== undefined && splitMode === undefined) {
      const renamed = await prisma.bill.update({
        where: { id: billId },
        data: { title },
        include: { items: { include: { assignedTo: true } }, splits: true },
      });
      return res.status(200).json(renamed);
    }
    await prisma.$transaction(async (tx) => {
      for (const split of bill.splits) {
        if (!split.paid) {
          await tx.friend.update({
            where: { id: split.friendId },
            data: { balanceOwed: { decrement: split.amountOwed } },
          });
        }
      }
      await tx.split.deleteMany({ where: { billId } });
      const items = await tx.billItem.findMany({ where: { billId } });
      for (const item of items) {
        await tx.billItem.update({
          where: { id: item.id },
          data: { assignedTo: { set: [] } },
        });
      }
      await tx.bill.update({ where: { id: billId }, data: { splitMode } });
      }, { timeout: 15000 });

    const updated = await prisma.bill.findUnique({
      where: { id: billId },
      include: { items: { include: { assignedTo: true } }, splits: true },
    });

    res.status(200).json(updated);
  } catch (err) {
    console.error("Update bill error:", err);
    res.status(500).json({ error: "Failed to update bill" });
  }
});

// Manually trigger reminder emails to everyone currently in this bill's splits
router.post("/:id/remind", requireAuth, async (req: AuthRequest, res) => {
  const billId = req.params.id;
  if (!billId || typeof billId !== "string") {
    return res.status(400).json({ error: "Invalid bill id" });
  }

  try {
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: { splits: { include: { friend: true } } },
    });

    if (!bill || bill.ownerId !== req.userId) {
      return res.status(404).json({ error: "Bill not found" });
    }

    if (bill.splits.length === 0) {
      return res.status(400).json({ error: "This bill hasn't been split yet" });
    }

    let sent = 0;
    let skipped = 0;

    for (const split of bill.splits) {
      if (split.paid) continue; // no need to remind someone who already paid
      if (!split.friend.email) {
        skipped++;
        continue;
      }
      try {
        await resend.emails.send({
          from: "onboarding@resend.dev",
          to: split.friend.email,
          subject: `Reminder: you owe ₹${split.amountOwed.toFixed(2)} for "${bill.title || "a bill"}"`,
          html: `<p>Hi ${split.friend.name}, just a friendly reminder — you owe <strong>₹${split.amountOwed.toFixed(2)}</strong> for "${bill.title || "a bill"}" on SplitSnap.</p>`,
        });
        sent++;
      } catch (emailErr) {
        console.error(`Reminder email to ${split.friend.name} failed:`, emailErr);
      }
    }

    res.status(200).json({ message: `Sent ${sent} reminder(s)`, sent, skipped });
  } catch (err) {
    console.error("Send reminders error:", err);
    res.status(500).json({ error: "Failed to send reminders" });
  }
});

// Permanently delete a bill (and its items/splits), reverting any unpaid balances first
router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const billId = req.params.id;
  if (!billId || typeof billId !== "string") {
    return res.status(400).json({ error: "Invalid bill id" });
  }

  try {
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: { splits: true },
    });

    if (!bill || bill.ownerId !== req.userId) {
      return res.status(404).json({ error: "Bill not found" });
    }

    await prisma.$transaction(async (tx) => {
      for (const split of bill.splits) {
        if (!split.paid) {
          await tx.friend.update({
            where: { id: split.friendId },
            data: { balanceOwed: { decrement: split.amountOwed } },
          });
        }
      }
      await tx.split.deleteMany({ where: { billId } });
      await tx.billItem.deleteMany({ where: { billId } });
      await tx.bill.delete({ where: { id: billId } });
    }, { timeout: 15000 });

    res.status(200).json({ message: "Bill deleted" });
  } catch (err) {
    console.error("Delete bill error:", err);
    res.status(500).json({ error: "Failed to delete bill" });
  }
});

export default router;

