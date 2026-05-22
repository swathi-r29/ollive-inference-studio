// src/utils/db.js
// Handles MongoDB connection with retry logic
// Uses mongoose for ODM; single connection instance reused across requests

import mongoose from "mongoose";

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set in environment");

  try {
    await mongoose.connect(uri, {
      // These are good defaults for a production app
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log(`[DB] Connected to MongoDB: ${uri.split("@").pop() || uri}`);
  } catch (err) {
    console.error("[DB] Connection failed:", err.message);
    // Retry once after 3 seconds — handles the race condition where
    // MongoDB container starts slightly after the backend container in Docker
    await new Promise((r) => setTimeout(r, 3000));
    await mongoose.connect(uri);
    isConnected = true;
  }

  mongoose.connection.on("disconnected", () => {
    isConnected = false;
    console.warn("[DB] Disconnected from MongoDB");
  });
}
