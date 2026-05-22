// src/controllers/chatController.js
// Handles all conversation and message operations.

import Conversation from "../models/Conversation.js";
import { streamChat } from "../services/llmService.js";

/**
 * GET /api/conversations
 * List all conversations, most recent first.
 * Returns light objects (no messages array) for the sidebar.
 */
export async function listConversations(req, res, next) {
  try {
    // Project out the messages array — we only need metadata for the list view
    const conversations = await Conversation.find({})
      .select("-messages")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json(conversations);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/conversations
 * Create a new conversation (empty, before any message is sent).
 */
export async function createConversation(req, res, next) {
  try {
    const { model = "gemini-2.5-flash", provider = "google", sessionId } = req.body;

    const conversation = await Conversation.create({
      model,
      provider,
      sessionId,
      title: "New conversation",
    });

    res.status(201).json(conversation);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/conversations/:id
 * Get a single conversation with all messages (for resuming).
 */
export async function getConversation(req, res, next) {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    res.json(conversation);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/conversations/:id/cancel
 * Mark a conversation as cancelled. The frontend aborts the stream itself;
 * this just persists the cancelled state.
 */
export async function cancelConversation(req, res, next) {
  try {
    const conversation = await Conversation.findByIdAndUpdate(
      req.params.id,
      { status: "cancelled" },
      { new: true }
    );
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    res.json(conversation);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/conversations/:id
 * Delete a conversation and all its messages.
 */
export async function deleteConversation(req, res, next) {
  try {
    const conversation = await Conversation.findByIdAndDelete(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/conversations/:id/messages
 * Add a user message and stream the assistant response back via SSE.
 *
 * Flow:
 *   1. Load conversation from DB
 *   2. Append user message
 *   3. Stream LLM response
 *   4. Append assistant message
 *   5. Save conversation
 */
export async function sendMessage(req, res, next) {
  try {
    const { content, model } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }

    // Load existing conversation
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    if (conversation.status === "cancelled") {
      return res.status(400).json({ error: "Cannot send to a cancelled conversation" });
    }

    // Use the model from the request body or fall back to the conversation's model
    const activeModel = model || conversation.model;

    // Add the user message to history
    conversation.messages.push({ role: "user", content: content.trim() });

    // Auto-generate title from first user message
    if (conversation.messages.length === 1) {
      conversation.title = content.trim().slice(0, 60);
    }

    await conversation.save();

    // Stream the response — this sets SSE headers and writes chunks
    // When done, fullText contains the complete response
    let fullText = "";
    try {
      const streamResult = await streamChat(
        conversation.messages,
        activeModel,
        res
      );
      fullText = streamResult.fullText;

      // Save successful assistant response
      conversation.messages.push({ role: "assistant", content: fullText });
      conversation.model = activeModel;
      conversation.status = "active";
      await conversation.save();
    } catch (err) {
      // If the stream failed mid-way but we did get some partial text, persist it!
      if (err.partialText && err.partialText.trim()) {
        conversation.messages.push({ role: "assistant", content: err.partialText.trim() });
        conversation.model = activeModel;
        conversation.status = "active";
        await conversation.save();
      }
      throw err;
    }

  } catch (err) {
    // If headers are already sent (streaming started), we can't send a JSON error
    if (!res.headersSent) {
      next(err);
    } else {
      console.error("[ChatController] Error after streaming started:", err.message);
    }
  }
}
