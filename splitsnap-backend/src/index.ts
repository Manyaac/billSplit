import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import { requireAuth } from "./middleware/auth.js";
import type { AuthRequest } from "./middleware/auth.js";
import uploadRoutes from "./routes/upload.js";
import parseRoutes from "./routes/parse.js";
import billRoutes from "./routes/bill.js";
import friendRoutes from "./routes/friend.js";
import billItemRoutes from "./routes/billItem.js";




dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/upload", uploadRoutes);
app.use("/parse", parseRoutes);
app.use("/bills", billRoutes);
app.use("/friends", friendRoutes);
app.use("/items", billItemRoutes);




app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/protected-test", requireAuth, (req: AuthRequest, res) => {
  res.json({ message: "You are authenticated", userId: req.userId });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));