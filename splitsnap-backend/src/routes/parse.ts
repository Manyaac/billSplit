import { Router } from "express";
import genAI from "../lib/gemini.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const receiptSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          price: { type: "number" },
          quantity: { type: "number" },
        },
        required: ["name", "price", "quantity"],
      },
    },
    subtotal: { type: "number" },
    tax: { type: "number" },
    total: { type: "number" },
  },
  required: ["items", "subtotal", "tax", "total"],
};

router.post("/receipt", requireAuth, async (req, res) => {
  const { imageUrl } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: "imageUrl is required" });
  }

  try {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return res.status(400).json({ error: "Could not fetch image from URL" });
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const base64Image = imageBuffer.toString("base64");
    const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

    const result = await genAI.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Extract every line item from this receipt image. For each item, give its name, unit price, and quantity. Also extract the subtotal, tax, and total amounts. If a value isn't visible on the receipt, make your best reasonable estimate.",
            },
            {
              inlineData: {
                mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: receiptSchema,
      },
    });

    const parsed = JSON.parse(result.text ?? "{}");
    res.status(200).json(parsed);
  } catch (err) {
    console.error("Gemini parse error:", err);
    res.status(500).json({ error: "Receipt parsing failed" });
  }
});

export default router;