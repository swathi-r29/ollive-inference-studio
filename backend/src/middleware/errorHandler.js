// src/middleware/errorHandler.js
// Centralised error handler — must be registered LAST in Express middleware chain.
// Catches errors thrown/passed via next(err) from any route or controller.

export function errorHandler(err, req, res, next) {
  // Log the full error on the server but never leak stack traces to clients
  console.error("[ErrorHandler]", err);

  // Mongoose validation errors → 400
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation failed",
      details: Object.values(err.errors).map((e) => e.message),
    });
  }

  // Mongoose duplicate key → 409
  if (err.code === 11000) {
    return res.status(409).json({ error: "Duplicate entry", field: Object.keys(err.keyPattern || {}) });
  }

  // Anthropic API errors forwarded from the service layer
  if (err.status && err.message) {
    return res.status(err.status).json({ error: err.message });
  }

  // Fallback
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
}
