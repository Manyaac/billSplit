import { Router } from "express";
import upload from "../lib/multer.js";
import cloudinary from "../lib/cloudinary.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post(
  "/receipt",
  requireAuth,
  upload.single("receipt"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const result = await new Promise<{ secure_url: string }>(
        (resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "splitsnap/receipts", resource_type: "image" },
            (error, result) => {
              if (error || !result) return reject(error);
              resolve(result);
            }
          );
          stream.end(req.file!.buffer);
        }
      );

      res.status(200).json({ url: result.secure_url });
    } catch (err) {
      console.error("Cloudinary upload error:", err);
      res.status(500).json({ error: "Image upload failed" });
    }
  }
);

export default router;