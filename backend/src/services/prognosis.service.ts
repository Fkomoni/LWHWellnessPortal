import { env } from '../config/env';
import { logger } from '../utils/logger';

// Prognosis requires this exact User-Agent — blank/default UAs are rejected.
const COMMON_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': '*/*',
  'User-Agent': 'PostmanRuntime/7.51.1',
  'Cache-Control': 'no-cache',
};

// Refresh 5 min before the 6-hour window closes, but per the API guidance
// cache for 55 minutes to stay well within the expiry.
const TOKEN_TTL_MS = 55 * 60 * 1000;

let cachedToken: string | null = null;
let cacheExpiresAt = 0;

// The response envelope varies — try every known wrapper and token key.
function extractToken(data: unknown): string | null {
  if (typeof data === 'string' && data.length > 20) return data;
  if (typeof data !== 'object' || data === null) return null;

  const obj = data as Record<string, unknown>;

  for (const key of ['data', 'Data', 'result', 'Result']) {
    if (obj[key] !== undefined) {
      const found = extractToken(obj[key]);
      if (found) return found;
    }
  }

  for (const key of [
    'access_token', 'accessToken', 'AccessToken',
    'token', 'Token',
    'bearer', 'Bearer', 'bearerToken', 'BearerToken',
  ]) {
    const val = obj[key];
    if (typeof val === 'string' && val.length > 20) return val;
  }

  return null;
}

async function fetchFreshToken(): Promise<string> {
  const res = await fetch(`${env.PROGNOSIS_API_URL}/api/ApiUsers/Login`, {
    method: 'POST',
    headers: COMMON_HEADERS,
    body: JSON.stringify({
      Username: env.PROGNOSIS_USERNAME,
      Password: env.PROGNOSIS_PASSWORD,
    }),
  });

  if (!res.ok) {
    throw new Error(`Prognosis auth failed: HTTP ${res.status}`);
  }

  const body: unknown = await res.json();
  const token = extractToken(body);
  if (!token) throw new Error('Prognosis auth: token not found in response envelope');
  return token;
}

export async function getPrognosisToken(): Promise<string> {
  if (cachedToken && Date.now() < cacheExpiresAt) return cachedToken;

  const token = await fetchFreshToken();
  cachedToken = token;
  cacheExpiresAt = Date.now() + TOKEN_TTL_MS;
  logger.info('Prognosis token refreshed', { expiresIn: '55m' });
  return token;
}

export function invalidatePrognosisToken(): void {
  cachedToken = null;
  cacheExpiresAt = 0;
}

export { COMMON_HEADERS as PROGNOSIS_HEADERS };
