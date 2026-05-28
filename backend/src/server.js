/**
 * VolunteerHub Backend Server
 * Express application with MongoDB integration and REST API routes.
 * Implements authentication, event management, and notification systems.
 */

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "./config/db.js";
import { startCronJobs } from "./utils/cronJob.js";
import { seedDefaultAccounts } from "./utils/seed.js";

import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import userRoutes from "./routes/user.routes.js";
import eventRoutes from "./routes/event.routes.js";
import registrationRoutes from "./routes/registration.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import statisticsRoutes from "./routes/statistics.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import postRoutes from "./routes/post.routes.js";
import commentRoutes from "./routes/comment.routes.js";
import eventActionRoutes from "./routes/eventAction.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");

dotenv.config({ path: envPath });
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));

await connectDB();
await seedDefaultAccounts();
startCronJobs();

app.get("/", (req, res) => res.send("✅ VolunteerHub Backend API is running..."));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/actions", eventActionRoutes);
app.use("/api/registrations", registrationRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/statistics", statisticsRoutes);
app.use("/api/notifications", notificationRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "API route not found", path: req.originalUrl });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));