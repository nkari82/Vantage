import crypto from "node:crypto";
import type { RequestHandler } from "express";

const SAFE_GET_PATHS = new Set([
  "/api/status",
  "/api/ak620/status",
  "/api/gpu-metrics",
  "/api/system-metrics",
  "/api/power-history",
]);

type AdminCredentials = {
  username: string;
  passwordHash: string;
};

let cachedSystemToken: string | undefined;
let cachedAdminCredentials: AdminCredentials | null | undefined;

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function getConfiguredSystemToken(): string {
  if (cachedSystemToken !== undefined) {
    return cachedSystemToken;
  }

  cachedSystemToken = readEnv("VANTAGE_SYSTEM_TOKEN");
  return cachedSystemToken;
}

export function getConfiguredAdminCredentials(): AdminCredentials | null {
  if (cachedAdminCredentials !== undefined) {
    return cachedAdminCredentials;
  }

  const username = readEnv("VANTAGE_ADMIN_USERNAME");
  const passwordHash = readEnv("VANTAGE_ADMIN_PASSWORD_HASH");
  cachedAdminCredentials = username && passwordHash ? { username, passwordHash } : null;
  return cachedAdminCredentials;
}

export function isAdminLoginConfigured(): boolean {
  return Boolean(getConfiguredSystemToken()) && getConfiguredAdminCredentials() !== null;
}

export function isAdminRoute(method: string, path: string): boolean {
  if (method === "GET" && SAFE_GET_PATHS.has(path)) {
    return false;
  }
  if (method === "POST" && path === "/api/login") {
    return false;
  }

  return path.startsWith("/api/");
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

function parsePasswordHash(passwordHash: string): { salt: Buffer; hash: Buffer } | null {
  const match = /^scrypt\$([0-9a-f]+)\$([0-9a-f]+)$/i.exec(passwordHash.trim());
  if (!match) {
    return null;
  }

  return {
    salt: Buffer.from(match[1], "hex"),
    hash: Buffer.from(match[2], "hex"),
  };
}

function verifyPassword(password: string, passwordHash: string): boolean {
  const parsed = parsePasswordHash(passwordHash);
  if (!parsed) {
    return false;
  }

  const derived = crypto.scryptSync(password, parsed.salt, parsed.hash.length);
  return crypto.timingSafeEqual(derived, parsed.hash);
}

export function validateAdminCredentials(username: string, password: string): boolean {
  const configured = getConfiguredAdminCredentials();
  if (!configured) {
    return false;
  }

  return tokensMatch(username.trim(), configured.username) && verifyPassword(password, configured.passwordHash);
}

export const requireAdminToken: RequestHandler = (req, res, next) => {
  const configuredToken = getConfiguredSystemToken();
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
