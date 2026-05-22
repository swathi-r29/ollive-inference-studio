// src/middleware/requestLogger.js
// HTTP request logging middleware.
// Logs method, path, status, and response time for every request.
// In production, swap console.log for a structured logger like pino or winston.

export function requestLogger(req, res, next) {
  const start = Date.now();

  // Log after response is sent so we capture status code and duration
  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
    console.log(
      `[${level}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );
  });

  next();
}
