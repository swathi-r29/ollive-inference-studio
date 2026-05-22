// src/models/Conversation.js
// Stores conversation metadata and the full message history.
//
// Schema design decisions:
// - messages are embedded (not referenced) because they are always
//   fetched together with the conversation. Embedding avoids N+1 queries
//   and is fine for typical chat sizes (< 200 messages per conversation).
// - We cap context at 20 messages on the backend to keep Anthropic costs predictable.
// - status field lets us track cancelled/active/completed states without
//   a separate status table.

import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    // Client-generated ID for optimistic UI updates
    clientId: String,
  },
  {
    // Store when each message was created
    timestamps: { createdAt: "createdAt", updatedAt: false },
  }
);

const ConversationSchema = new mongoose.Schema(
  {
    // Human-readable title derived from the first user message
    title: {
      type: String,
      default: "New conversation",
      maxlength: 120,
    },
    // Which model was selected for this conversation
    model: {
      type: String,
      required: true,
      default: "gemini-2.5-flash",
    },
    // Provider name (anthropic / openai / etc)
    provider: {
      type: String,
      default: "google",
    },
    // Embedded messages array
    messages: [MessageSchema],
    // Conversation lifecycle state
    status: {
      type: String,
      enum: ["active", "cancelled", "completed"],
      default: "active",
    },
    // Optional session ID for grouping conversations by user/session
    sessionId: String,
    // Total token count across all turns in this conversation
    totalTokens: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
    // Use virtuals when converting to JSON (e.g. for messageCount)
    toJSON: { virtuals: true },
  }
);

// Virtual field: number of messages without storing it redundantly
ConversationSchema.virtual("messageCount").get(function () {
  return this.messages.length;
});

// Index for listing conversations sorted by most recent
ConversationSchema.index({ createdAt: -1 });
ConversationSchema.index({ sessionId: 1, createdAt: -1 });

export default mongoose.model("Conversation", ConversationSchema);
