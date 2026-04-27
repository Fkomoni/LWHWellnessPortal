import { env } from '../config/env';
import { logger } from '../utils/logger';

export class PrognosisUpstreamError extends Error {
  constructor(public readonly cause: string) {
    super(`Prognosis upstream error: ${cause}`);
    this.name = 'PrognosisUpstreamError';
  }
}

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
    throw new PrognosisUpstreamError(`auth HTTP ${res.status}`);
  }

  const body: unknown = await res.json();
  const token = extractToken(body);
  if (!token) throw new PrognosisUpstreamError('token not found in auth response envelope');
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

// ─── Enrollee bio data ────────────────────────────────────────────────────────

export type EnrolleeBioData = {
  firstName: string;
  otherNames: string;
  surname: string;
  fullName: string;
  dateOfBirth: string | null; // YYYY-MM-DD, normalised
  phone: string | null;
  schemeId: string | null;    // Prognosis SchemeID — required for gym lookup
};

// Handles top-level, data/result/Data wrappers, and array envelopes.
function unwrapBody(body: unknown): Record<string, unknown> | null {
  if (Array.isArray(body)) return body.length > 0 ? unwrapBody(body[0]) : null;
  if (typeof body !== 'object' || body === null) return null;
  const obj = body as Record<string, unknown>;
  for (const key of ['data', 'Data', 'result', 'Result']) {
    if (obj[key] !== undefined) {
      const inner = unwrapBody(obj[key]);
      if (inner) return inner;
    }
  }
  return obj;
}

function extractDob(obj: Record<string, unknown>): string | null {
  for (const key of ['Member_DateOfBirth', 'DateOfBirth', 'dateOfBirth', 'DOB', 'dob']) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) {
      const d = new Date(val.trim());
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }
  return null;
}

function extractName(obj: Record<string, unknown>) {
  const str = (key: string) => (typeof obj[key] === 'string' ? (obj[key] as string).trim() : '');

  const firstName = str('Member_FirstName') || str('FirstName');
  const otherNames = str('Member_othernames') || str('OtherNames') || str('MiddleName');
  const surname = str('Member_Surname') || str('Surname') || str('LastName');

  if (firstName || surname) {
    return {
      firstName,
      otherNames,
      surname,
      fullName: [firstName, otherNames, surname].filter(Boolean).join(' '),
    };
  }

  // Fall back to bulk field — internal word order isn't guaranteed, so this is last resort
  const bulk = str('Member_CustomerName') || str('CustomerName');
  const parts = bulk.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    otherNames: parts.slice(1, -1).join(' '),
    surname: parts[parts.length - 1] ?? '',
    fullName: bulk,
  };
}

function extractSchemeId(obj: Record<string, unknown>): string | null {
  for (const key of [
    'Member_PlanID',                                                   // confirmed field name
    'Member_SchemeID', 'Member_PlanCode', 'Member_SchemeCode', 'Member_SubGroupID',
    'SchemeID', 'PlanID', 'PlanCode', 'SchemeCode', 'SubGroupID', 'GroupCode',
  ]) {
    const val = obj[key];
    if ((typeof val === 'string' || typeof val === 'number') && String(val).trim()) {
      return String(val).trim();
    }
  }
  return null;
}

function extractPhone(obj: Record<string, unknown>): string | null {
  for (const key of [
    'Member_Phone_One', 'Member_Phone_Two', 'Member_Phone_Three',
    'Member_Phone_Four', 'Member_Phone_Five', 'Phone', 'PhoneNumber',
  ]) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return null;
}

/**
 * Fetches an ENROLLEE's bio data from the Prognosis API.
 *
 * IMPORTANT: The enrolleeId must NOT be URL-encoded — Prognosis requires the
 * literal '/' in IDs like "21000645/0". encodeURIComponent converts it to %2F
 * and the endpoint silently returns an empty body.  The ID must already be
 * validated upstream against ^[A-Za-z0-9/\-]+$ before calling this function.
 *
 * Throws PrognosisUpstreamError on network failures or non-2xx responses so
 * the caller can distinguish "service down" from "member not found".
 * Returns null when the response body is empty (member not in Prognosis).
 */
export async function getEnrolleeBioData(enrolleeId: string): Promise<EnrolleeBioData | null> {
  let token: string;
  try {
    token = await getPrognosisToken();
  } catch (err) {
    if (err instanceof PrognosisUpstreamError) throw err;
    throw new PrognosisUpstreamError(String(err));
  }

  // Build URL by hand — do NOT use URLSearchParams; it encodes '/' to '%2F'.
  const url = `${env.PROGNOSIS_API_URL}/api/EnrolleeProfile/GetEnrolleeBioDataByEnrolleeID?enrolleeid=${enrolleeId}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { ...COMMON_HEADERS, accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new PrognosisUpstreamError(`network error: ${String(err)}`);
  }

  if (res.status === 401) {
    invalidatePrognosisToken();
    throw new PrognosisUpstreamError('token rejected (401)');
  }
  if (!res.ok) {
    throw new PrognosisUpstreamError(`HTTP ${res.status}`);
  }

  const rawBody: unknown = await res.json();

  // Log shape (keys only, never values) — surfaces shape changes without leaking PII
  logger.info('prognosis.enrollee.bio', {
    enrolleeId,
    status: res.status,
    bodyKeys: typeof rawBody === 'object' && rawBody !== null ? Object.keys(rawBody as object) : typeof rawBody,
  });

  const record = unwrapBody(rawBody);
  if (!record || Object.keys(record).length === 0) {
    logger.warn('prognosis.enrollee.bio: unrecognised shape or empty — member not in Prognosis', { enrolleeId });
    return null;
  }

  const { firstName, otherNames, surname, fullName } = extractName(record);
  return {
    firstName,
    otherNames,
    surname,
    fullName,
    dateOfBirth: extractDob(record),
    phone: extractPhone(record),
    schemeId: extractSchemeId(record),
  };
}

// ─── Gym / Spa finder ─────────────────────────────────────────────────────────

export type PrognosisGym = {
  gymCode: string;
  gymName: string;
  state: string;
  lga: string;
  address: string;
  phone: string | null;
};

// Unwraps list envelopes: data/result/Data/Result arrays, or top-level arrays.
function unwrapList(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (typeof body !== 'object' || body === null) return [];
  const obj = body as Record<string, unknown>;
  for (const key of ['data', 'Data', 'result', 'Result', 'list', 'List', 'records', 'Records']) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
    if (obj[key] !== undefined) {
      const inner = unwrapList(obj[key]);
      if (inner.length > 0) return inner;
    }
  }
  return [];
}

function extractGym(raw: unknown): PrognosisGym | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const str = (keys: string[]) => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };

  const gymName = str(['GymName', 'FacilityName', 'ProviderName', 'GymandSpaName', 'Name', 'HospName']);
  if (!gymName) return null; // skip records with no name

  return {
    gymCode: str(['GymCode', 'FacilityCode', 'ProviderCode', 'Code', 'HospCode', 'ID']),
    gymName,
    state: str(['State', 'StateName', 'StateCode']),
    lga: str(['LGA', 'LocalGovernment', 'LocalGovtArea', 'Town', 'Area', 'City', 'District']),
    address: str(['Address', 'FullAddress', 'GymAddress', 'Location', 'Street', 'AddressLine1']),
    phone: str(['Phone', 'PhoneNo', 'Telephone', 'ContactPhone']) || null,
  };
}

/**
 * Returns the list of gyms/spas covered under a Prognosis scheme.
 * Throws PrognosisUpstreamError on network/auth failures.
 * Returns [] when Prognosis returns an empty list (valid — no gyms for that scheme).
 */
export async function getGymsByScheme(schemeId: string): Promise<PrognosisGym[]> {
  let token: string;
  try {
    token = await getPrognosisToken();
  } catch (err) {
    if (err instanceof PrognosisUpstreamError) throw err;
    throw new PrognosisUpstreamError(String(err));
  }

  const url =
    `${env.PROGNOSIS_API_URL}/api/ListValues/GetGeneralGymandSpaByPlanCode` +
    `?SchemeID=${encodeURIComponent(schemeId)}&MinimumID=0&NoOfRecords=100&pageSize=0`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { ...COMMON_HEADERS, accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new PrognosisUpstreamError(`network error: ${String(err)}`);
  }

  if (res.status === 401) {
    invalidatePrognosisToken();
    throw new PrognosisUpstreamError('token rejected (401)');
  }
  if (!res.ok) {
    throw new PrognosisUpstreamError(`HTTP ${res.status}`);
  }

  const rawBody: unknown = await res.json();

  const records = unwrapList(rawBody);

  logger.info('prognosis.gyms', {
    schemeId,
    status: res.status,
    bodyKeys: typeof rawBody === 'object' && rawBody !== null ? Object.keys(rawBody as object) : typeof rawBody,
    recordCount: records.length,
    firstRecordKeys: records.length > 0 && typeof records[0] === 'object' && records[0] !== null
      ? Object.keys(records[0] as object)
      : null,
  });

  if (records.length === 0) {
    logger.warn('prognosis.gyms: empty list or unrecognised shape', { schemeId });
  }

  return records.map(extractGym).filter((g): g is PrognosisGym => g !== null);
}
