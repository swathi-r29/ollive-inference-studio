// src/routes/chat.js
import { Router } from "express";
import {
  listConversations,
  createConversation,
  getConversation,
  cancelConversation,
  deleteConversation,
  sendMessage,
} from "../controllers/chatController.js";

const router = Router();

// Conversation CRUD
router.get("/", listConversations);
router.post("/", createConversation);
router.get("/:id", getConversation);
router.delete("/:id", deleteConversation);
router.patch("/:id/cancel", cancelConversation);

// Streaming message endpoint
router.post("/:id/messages", sendMessage);

export default router;
