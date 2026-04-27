import { Member, Role } from '@prisma/client';
import { db } from '../config/database';
import { getEnrolleeBioData, PrognosisUpstreamError } from './prognosis.service';

export type AuthenticatedMember = Pick<Member, 'id' | 'firstName' | 'lastName' | 'memberRef' | 'role'> & {
  schemeId: string | null;
};

export { PrognosisUpstreamError };

/**
 * Authenticates an ENROLLEE by Member ID and date of birth.
 *
 * The date of birth is validated against the Prognosis API (source of truth).
 * The schemeId returned in the bio data is passed back to the caller so it
 * can be cached on the local member record for subsequent gym lookups.
 *
 * Throws PrognosisUpstreamError when Prognosis is unreachable.
 * Returns null when credentials are simply wrong or the member is inactive.
 */
export async function authenticateByDob(
  memberRef: string,
  dateOfBirth: Date,
): Promise<AuthenticatedMember | null> {
  const bioData = await getEnrolleeBioData(memberRef.trim());
  if (!bioData || !bioData.dateOfBirth) return null;

  const stored = new Date(bioData.dateOfBirth + 'T00:00:00.000Z');
  const dobMatches =
    dateOfBirth.getUTCFullYear() === stored.getUTCFullYear() &&
    dateOfBirth.getUTCMonth() === stored.getUTCMonth() &&
    dateOfBirth.getUTCDate() === stored.getUTCDate();

  if (!dobMatches) return null;

  const member = await db.member.findFirst({
    where: { memberRef: memberRef.trim(), role: Role.ENROLLEE, isActive: true },
    select: { id: true, firstName: true, lastName: true, memberRef: true, role: true },
  });

  if (!member) return null;

  return { ...member, schemeId: bioData.schemeId };
}
