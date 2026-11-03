import { timingSafeEqual } from "node:crypto";

function configuredToken() {
  return process.env.RAG_ACCESS_TOKEN?.trim() || "";
}

export function accessProtectionEnabled() {
  return Boolean(configuredToken()) || process.env.NODE_ENV === "production";
}

function tokensMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function hasValidAccessToken(request: Request) {
  const expected = configuredToken();
  if (!accessProtectionEnabled()) return true;
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const actual = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return tokensMatch(actual, expected);
}

export function unauthorizedResponse(request: Request) {
  const expected = configuredToken();
  if (!expected) return process.env.NODE_ENV === "production"
    ? Response.json({ error: "Set RAG_ACCESS_TOKEN before exposing the production admin API." }, { status: 503 })
    : null;
  const header = request.headers.get("authorization") || "";
  const actual = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (tokensMatch(actual, expected)) return null;
  return Response.json({ error: "This deployment requires a valid access token." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
}
