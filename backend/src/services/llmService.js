import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const MAX_CONTEXT_MESSAGES = 20;

// Initialize clients lazily or handle missing keys gracefully
const getGeminiClient = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in the environment.");
  return new GoogleGenerativeAI(key);
};

const getAnthropicClient = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set in the environment. Please add it to your backend/.env file.");
  return new Anthropic({ apiKey: key });
};

const getOpenAIClient = () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set in the environment. Please add it to your backend/.env file.");
  return new OpenAI({ apiKey: key });
};

export async function streamChat(messages, model, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let provider = "google";
  if (model.startsWith("claude")) {
    provider = "anthropic";
  } else if (model.startsWith("gpt") || model.startsWith("o1") || model.startsWith("o3")) {
    provider = "openai";
  }

  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    if (provider === "google") {
      // ─── Google Gemini Adapter ───
      const genAI = getGeminiClient();
      const history = messages.slice(0, -1).slice(-MAX_CONTEXT_MESSAGES);
      const lastMessage = messages[messages.length - 1];

      const geminiHistory = history.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const geminiModel = genAI.getGenerativeModel({ model });
      const chat = geminiModel.startChat({ history: geminiHistory });
      const result = await chat.sendMessageStream(lastMessage.content);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          fullText += text;
          res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
        }
      }

      // Gemini returns usage metadata after the stream completes
      const finalResponse = await result.response;
      inputTokens = finalResponse.usageMetadata?.promptTokenCount || 0;
      outputTokens = finalResponse.usageMetadata?.candidatesTokenCount || 0;

    } else if (provider === "anthropic") {
      // ─── Anthropic Claude Adapter ───
      const anthropic = getAnthropicClient();
      const contextMessages = messages.slice(-MAX_CONTEXT_MESSAGES);
      const formattedMessages = [];
      let systemPrompt = "";

      for (const m of contextMessages) {
        if (m.role === "system") {
          systemPrompt = m.content;
        } else {
          formattedMessages.push({
            role: m.role,
            content: m.content,
          });
        }
      }

      // Ensure alternating roles starting with user
      while (formattedMessages.length > 0 && formattedMessages[0].role === "assistant") {
        formattedMessages.shift();
      }

      const stream = await anthropic.messages.create({
        model: model,
        max_tokens: 4096,
        messages: formattedMessages,
        system: systemPrompt || undefined,
        stream: true,
      });

      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta?.text) {
          const text = chunk.delta.text;
          fullText += text;
          res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
        } else if (chunk.type === "message_start") {
          inputTokens = chunk.message?.usage?.input_tokens || 0;
        } else if (chunk.type === "message_delta") {
          outputTokens = chunk.usage?.output_tokens || 0;
        }
      }

    } else if (provider === "openai") {
      // ─── OpenAI GPT Adapter ───
      const openai = getOpenAIClient();
      const contextMessages = messages.slice(-MAX_CONTEXT_MESSAGES);
      const formattedMessages = contextMessages.map((m) => ({
        role: m.role === "system" || m.role === "assistant" || m.role === "user" ? m.role : "user",
        content: m.content,
      }));

      const stream = await openai.chat.completions.create({
        model: model,
        messages: formattedMessages,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        const text = choice?.delta?.content;
        if (text) {
          fullText += text;
          res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || 0;
          outputTokens = chunk.usage.completion_tokens || 0;
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done", inputTokens, outputTokens })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
    res.end();
    err.partialText = fullText;
    throw err;
  }

  return { fullText, inputTokens, outputTokens };
}
