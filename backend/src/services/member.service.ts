import { Member, Role } from '@prisma/client';
import { db } from '../config/database';
import { getEnrolleeBioData, PrognosisUpstreamError } from './prognosis.service';

export type AuthenticatedMember = Pick<Member, 'id' | 'firstName' | 'lastName' | 'memberRef' | 'role'>;

export { PrognosisUpstreamError };

/**
 * Authenticates an ENROLLEE by Member ID and date of birth.
 *
 * The date of birth is validated against the Prognosis API (source of truth) —
 * it is never stored locally.  The local member record must also exist and be
 * active; this guards against members who exist in Prognosis but haven't been
 * enrolled in the portal yet.
 *
 * Throws PrognosisUpstreamError when Prognosis is unreachable so callers can
 * return 503 instead of 401 (wrong-credentials is a different code path).
 * Returns null when credentials are simply wrong or the member is inactive.
 */
export async function authenticateByDob(
  memberRef: string,
  dateOfBirth: Date,
): Promise<AuthenticatedMember | null> {
  // 1. Fetch authoritative bio data — throws PrognosisUpstreamError if Prognosis is down
  const bioData = await getEnrolleeBioData(memberRef.trim());
  if (!bioData || !bioData.dateOfBirth) return null;

  // 2. Compare date of birth — year / month / day only, ignoring time zone drift
  const stored = new Date(bioData.dateOfBirth + 'T00:00:00.000Z');
  const dobMatches =
    dateOfBirth.getUTCFullYear() === stored.getUTCFullYear() &&
    dateOfBirth.getUTCMonth() === stored.getUTCMonth() &&
    dateOfBirth.getUTCDate() === stored.getUTCDate();

  if (!dobMatches) return null;

  // 3. Resolve local member record — must be active in our portal
  return db.member.findFirst({
    where: { memberRef: memberRef.trim(), role: Role.ENROLLEE, isActive: true },
    select: { id: true, firstName: true, lastName: true, memberRef: true, role: true },
  });
}
