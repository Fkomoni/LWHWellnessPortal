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

// ─── Wellness benefit ─────────────────────────────────────────────────────────

export type WellnessBenefit = {
  planType: string;
  sessionLimit: number;
  sessionsUsed: number;
  sessionsRemaining: number;
  resetDate: string | null;  // YYYY-MM-DD
  status: string;            // 'ACTIVE' | 'INACTIVE' etc.
};

/**
 * Fetches the live wellness benefit for a member from Prognosis.
 *
 * IMPORTANT: memberRef must NOT be URL-encoded — same gotcha as GetEnrolleeBioData.
 * Validate against ^[A-Za-z0-9/\-]+$ before calling.
 * Returns null when the member is not found in Prognosis.
 */
export async function getWellnessBenefit(memberRef: string): Promise<WellnessBenefit | null> {
  let token: string;
  try {
    token = await getPrognosisToken();
  } catch (err) {
    if (err instanceof PrognosisUpstreamError) throw err;
    throw new PrognosisUpstreamError(String(err));
  }

  const url = `${env.PROGNOSIS_API_URL}/api/WellnessBenefit/GetBenefit?memberRef=${memberRef}`;

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
  if (res.status === 404) return null;
  if (!res.ok) throw new PrognosisUpstreamError(`HTTP ${res.status}`);

  const rawBody: unknown = await res.json();
  const record = unwrapBody(rawBody);
  if (!record || Object.keys(record).length === 0) return null;

  const str = (keys: string[]) => {
    for (const k of keys) {
      const v = record[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };
  const num = (keys: string[]) => {
    for (const k of keys) {
      const v = record[k];
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim()) { const n = parseInt(v, 10); if (!isNaN(n)) return n; }
    }
    return 0;
  };

  const resetRaw = str(['resetDate', 'ResetDate', 'reset_date', 'PeriodEndDate', 'EndDate']);
  const resetDate = resetRaw ? (() => { const d = new Date(resetRaw); return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]; })() : null;

  logger.info('prognosis.wellness.benefit', { memberRef, status: res.status });

  return {
    planType: str(['planType', 'PlanType', 'plan_type', 'PlanName', 'Member_Plan']),
    sessionLimit: num(['sessionLimit', 'SessionLimit', 'session_limit', 'sessionsPerMonth', 'MonthlyLimit']),
    sessionsUsed: num(['sessionsUsed', 'SessionsUsed', 'sessions_used', 'UsedSessions']),
    sessionsRemaining: num(['sessionsRemaining', 'SessionsRemaining', 'sessions_remaining', 'RemainingSession']),
    resetDate,
    status: (str(['status', 'Status', 'BenefitStatus', 'MemberStatus']) || 'ACTIVE').toUpperCase(),
  };
}

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
    // Confirmed correct value is ~139532 — try the most likely field names first
    'SchemeNo', 'PlanNo', 'Member_SchemeNo', 'Member_PlanNo',
    'Member_SchemeID', 'SchemeID',
    'Member_PlanID', 'PlanID',                                         // Member_PlanID=139533 (off by 1 from expected)
    'Member_PlanCode', 'Member_SchemeCode', 'Member_SubGroupID',
    'PlanCode', 'SchemeCode', 'SubGroupID', 'GroupCode',
    'Member_MemberUniqueID',                                           // last resort — wrong scale
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

  // Log shape + record keys (never values) — surfaces available SchemeID-candidate fields
  logger.info('prognosis.enrollee.bio', {
    enrolleeId,
    status: res.status,
    bodyKeys: typeof rawBody === 'object' && rawBody !== null ? Object.keys(rawBody as object) : typeof rawBody,
    recordKeys: (() => {
      const r = unwrapBody(rawBody);
      return r ? Object.keys(r) : null;
    })(),
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
  latitude: number | null;
  longitude: number | null;
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
  const numOrNull = (k: string): number | null => {
    const v = obj[k];
    if (typeof v === 'number' && v !== 0) return v;
    if (typeof v === 'string' && v.trim()) {
      const n = parseFloat(v.trim());
      if (!isNaN(n) && n !== 0) return n;
    }
    return null;
  };

  // gps_location fallback — may be "lat,lng" string when lat/lng fields are 0/null
  const parseGpsLocation = (): [number | null, number | null] => {
    const raw = obj['gps_location'];
    if (typeof raw !== 'string' || !raw.trim()) return [null, null];
    const parts = raw.trim().split(/[,\s]+/);
    if (parts.length < 2) return [null, null];
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    return (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) ? [lat, lng] : [null, null];
  };

  const gymName = str(['provider', 'GymName', 'FacilityName', 'ProviderName', 'GymandSpaName', 'Name', 'HospName']);
  if (!gymName) return null;

  let latitude = numOrNull('latitude');
  let longitude = numOrNull('longitude');
  if (latitude === null || longitude === null) {
    [latitude, longitude] = parseGpsLocation();
  }

  return {
    gymCode: str(['ProviderCode', 'GymCode', 'FacilityCode', 'Code', 'HospCode', 'ID']),
    gymName,
    state: str(['StateOfOrigin', 'State', 'StateName', 'StateCode']),
    lga: str(['CityOfOrigin', 'region', 'LGA', 'LocalGovernment', 'LocalGovtArea', 'Town', 'City', 'District']),
    address: str(['ProviderAddress', 'Address', 'FullAddress', 'GymAddress', 'Location', 'Street', 'AddressLine1']),
    phone: str(['phone1', 'phone2', 'Phone', 'PhoneNo', 'Telephone', 'ContactPhone']) || null,
    latitude,
    longitude,
  };
}

const INACTIVE_GYM_PATTERN = /suspended|terminated|closed/i;

async function fetchGymPage(
  token: string,
  schemeId: string,
  minimumId: number,
): Promise<{ records: unknown[]; totalRecord: number }> {
  const url =
    `${env.PROGNOSIS_API_URL}/api/ListValues/GetGeneralGymandSpaByPlanCode` +
    `?SchemeID=${encodeURIComponent(schemeId)}&MinimumID=${minimumId}&NoOfRecords=100&pageSize=0`;

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
    logger.warn('prognosis.gyms: non-OK response', { schemeId, httpStatus: res.status });
    throw new PrognosisUpstreamError(`HTTP ${res.status}`);
  }

  const rawBody: unknown = await res.json();
  const records = unwrapList(rawBody);

  let totalRecord = 0;
  if (typeof rawBody === 'object' && rawBody !== null) {
    const env2 = rawBody as Record<string, unknown>;
    if (typeof env2['totalRecord'] === 'number') totalRecord = env2['totalRecord'];
  }

  return { records, totalRecord };
}

/**
 * Returns all gyms/spas covered under a Prognosis scheme, paginating until
 * every record is fetched. Gyms with Suspended/Terminated/Closed in their
 * name are excluded. Throws PrognosisUpstreamError on network/auth failures.
 */
export async function getGymsByScheme(schemeId: string): Promise<PrognosisGym[]> {
  let token: string;
  try {
    token = await getPrognosisToken();
  } catch (err) {
    if (err instanceof PrognosisUpstreamError) throw err;
    throw new PrognosisUpstreamError(String(err));
  }

  const allRecords: unknown[] = [];
  let minimumId = 0;
  let totalRecord = 0;
  const MAX_PAGES = 20;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchGymPage(token, schemeId, minimumId);

    if (page === 0) {
      totalRecord = result.totalRecord;
      logger.info('prognosis.gyms', {
        schemeId,
        totalRecord,
        firstRecordKeys: result.records.length > 0 && typeof result.records[0] === 'object' && result.records[0] !== null
          ? Object.keys(result.records[0] as object)
          : null,
      });
    }

    allRecords.push(...result.records);

    if (result.records.length === 0) break;

    // Check if we've fetched everything
    if (totalRecord > 0 && allRecords.length >= totalRecord) break;

    // Advance cursor using last record's provider_id
    const last = result.records[result.records.length - 1];
    if (typeof last === 'object' && last !== null) {
      const lastId = (last as Record<string, unknown>)['provider_id'];
      if (typeof lastId === 'number' && lastId > minimumId) {
        minimumId = lastId;
      } else {
        break; // no valid cursor — stop to avoid infinite loop
      }
    } else {
      break;
    }
  }

  logger.info('prognosis.gyms: pagination complete', { schemeId, totalFetched: allRecords.length, totalRecord });

  if (allRecords.length === 0) {
    logger.warn('prognosis.gyms: empty list or unrecognised shape', { schemeId });
  }

  return allRecords
    .map(extractGym)
    .filter((g): g is PrognosisGym => g !== null)
    .filter((g) => !INACTIVE_GYM_PATTERN.test(g.gymName));
}
