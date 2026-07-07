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

- `SM_MASTER_KEY` is configured only through environment/deployment secrets.
- Database backups contain ciphertext only; the master key must be backed up separately by Infra.
- Logs must use redaction helpers and avoid request body logging.
- API tokens are stored as hashes with a display prefix; full tokens are shown once.
- Demo data must be fake and safe to disclose.

See [security-design.md](security-design.md) for the detailed AES-256-GCM envelope encryption method, persisted field shape, redaction boundary, audit rules, and current prototype limitations.
