import crypto from "node:crypto";
import type { RequestHandler } from "express";

const SAFE_GET_PATHS = new Set([
  "/api/status",
  "/api/ak620/status",
  "/api/gpu-metrics",
  "/api/system-metrics",
  "/api/power-history",
]);

function getConfiguredAdminToken(): string {
  return process.env.VANTAGE_ADMIN_TOKEN?.trim() ?? "";
}

function extractToken(headerValue: string | undefined): string {
  if (!headerValue) {
    return "";
  }

  const bearerPrefix = "Bearer ";
  return headerValue.startsWith(bearerPrefix) ? headerValue.slice(bearerPrefix.length).trim() : headerValue.trim();
}

function tokensMatch(providedToken: string, configuredToken: string): boolean {
  if (!providedToken || !configuredToken) {
    return false;
  }

  const provided = Buffer.from(providedToken);
  const configured = Buffer.from(configuredToken);
  return provided.length === configured.length && crypto.timingSafeEqual(provided, configured);
}

export function isAdminRoute(method: string, path: string): boolean {
  if (method === "GET" && SAFE_GET_PATHS.has(path)) {
    return false;
  }

  return path.startsWith("/api/");
}

export const requireAdminToken: RequestHandler = (req, res, next) => {
  const configuredToken = getConfiguredAdminToken();
  if (!configuredToken) {
    res.status(503).json({ error: "Admin token is not configured" });
    return;
  }

  const providedToken = extractToken(req.header("authorization")) || extractToken(req.header("x-vantage-admin-token"));
  if (!tokensMatch(providedToken, configuredToken)) {
    res.status(401).json({ error: "Admin token required" });
    return;
  }

  next();
};
