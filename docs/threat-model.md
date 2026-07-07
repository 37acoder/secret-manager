# Threat Model Notes

## In Scope For MVP

- Single-instance self-hosted deployment.
- Email/password users with httpOnly sessions.
- Project/vault membership checks.
- API tokens scoped to vaults and read/write operations.
- Secret values encrypted at rest.
- Audit events for secret reveal, copy, update, token creation, and token revocation.

## Out Of Scope For MVP

- Hosted SaaS multi-tenancy.
- KMS/HSM/BYOK.
- SSO/SAML/SCIM.
- Automatic rotation and leak scanning.
- High availability and disaster recovery.

## Required Controls

- Vault passwords are never stored; only encrypted verifier payloads are stored.
- Database backups contain ciphertext only; vault passwords are required separately to decrypt values.
- Logs must use redaction helpers and avoid request body logging.
- CLI temporary tokens are stored as hashes with a display prefix and short in-memory decrypt key; full tokens are shown once.
- Demo data must be fake and safe to disclose.

See [security-design.md](security-design.md) for the detailed AES-256-GCM envelope encryption method, persisted field shape, redaction boundary, audit rules, and current prototype limitations.
