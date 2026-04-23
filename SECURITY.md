# LWH Wellness Portal — Security Controls

This document maps security controls to OWASP Top 10 and IT team scanning criteria.

## OWASP Top 10 Coverage

| OWASP | Risk | Control Implemented |
|-------|------|---------------------|
| A01 | Broken Access Control | JWT RBAC middleware, role-scoped API routes, resource ownership checks |
| A02 | Cryptographic Failures | OTP stored as bcrypt hash (never plaintext), JWT secrets ≥64 chars, TLS enforced on Render |
| A03 | Injection | Prisma ORM (parameterized queries), Zod input validation on all endpoints |
| A04 | Insecure Design | Zero-trust session model, OTP expiry, refresh token rotation, threat-modeled flows |
| A05 | Security Misconfiguration | Helmet.js headers, strict CORS whitelist, no default credentials, env validation at startup |
| A06 | Vulnerable Components | Minimal dependencies, `npm audit` in CI |
| A07 | Auth Failures | Rate limiting (5 auth attempts / 15 min), OTP max attempts, 15-min access tokens, httpOnly refresh cookies |
| A08 | Data Integrity | JWT issuer/audience validation, Zod schema on all inputs, no client-trust |
| A09 | Logging & Monitoring | Audit log to DB + Winston logger for every auth event, SIEM-ready JSON format, 7-year retention |
| A10 | SSRF | No user-controlled URLs in server-side requests |

## Security Headers (via Helmet)

- `Content-Security-Policy` — restricts script/style/connect sources to self
- `X-Frame-Options: DENY` — prevents clickjacking
- `Strict-Transport-Security` — HSTS with preload
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

## Authentication Flow Security

1. **OTP generation** — `crypto.randomBytes()`, never `Math.random()`
2. **OTP storage** — bcrypt hash, never plaintext; auto-invalidates prior OTPs on new request
3. **OTP attempt limiting** — 5 max attempts; increment BEFORE comparing (prevents timing bypass)
4. **User enumeration prevention** — same response whether member exists or not on `/request-otp`
5. **Access tokens** — 15-minute expiry, signed with HS256, issuer/audience validated
6. **Refresh tokens** — 7-day expiry, stored as SHA-256 hash in DB, httpOnly SameSite=Strict cookie
7. **Token rotation** — refresh token rotated on every use; reuse detection triggers full revocation
8. **Logout** — revokes all refresh tokens for user

## Data Protection

- OTP codes: bcrypt-hashed (rounds = 12)
- Refresh tokens: SHA-256 hashed
- Audit logs: sensitive fields (phone, OTP) redacted before persistence
- No secrets in code — `.env.example` shows structure, actual values in Render environment

## Rate Limiting

| Endpoint | Window | Max Requests |
|----------|--------|--------------|
| `/api/auth/request-otp` | 15 min | 5 per IP+phone |
| `/api/auth/verify-otp` | 15 min | 5 per IP+phone |
| OTP generation | 60 sec | 1 per IP |
| All other API | 15 min | 100 per IP |

## Audit Log Schema

Every authentication event and sensitive action logs:
- `userId`, `userRole`, `action`, `resource`, `resourceId`
- `ipAddress`, `userAgent`
- `status` (SUCCESS/FAILURE)
- `timestamp`
- `details` (sanitised — no PII/OTP values)

Retention target: 7 years (NAICOM compliance).

## Production Checklist (before Azure deployment)

- [ ] Replace `OTP_VISIBLE_IN_DEV=false` (already done in production env)
- [ ] Integrate real WhatsApp Business API (360Dialog/Twilio)
- [ ] Enable Azure Key Vault for JWT secrets
- [ ] Set up Azure Monitor / Log Analytics for SIEM
- [ ] Enable Azure SQL Threat Protection
- [ ] WAF (Azure Application Gateway)
- [ ] Penetration test (OWASP ZAP + manual)
- [ ] DAST scan in CI/CD pipeline
