# Security Policy

SecretManager is an MVP prototype and is not ready for production secret storage.

## Supported Scope

Current security expectations apply to local prototype and demo use only.

Do not store real production secrets in this project until storage, deployment, key management, authentication, authorization, backup, and audit boundaries have been reviewed and hardened.

## Reporting Security Issues

Do not open public issues with raw secrets, credentials, tokens, private logs, or screenshots containing sensitive values.

For now, report security concerns privately to the 37A Home maintainers or through the company issue tracker with all sensitive values redacted.

## Secret Handling Rules

- Never commit `.env`, `.env.local`, real credentials, plaintext exports, or usable API tokens.
- Never paste real secrets into docs, comments, chat, screenshots, fixtures, seed data, or logs.
- Use fake values such as `demo-provider-secret-value` for demos and tests.
- Keep values masked by default in UI and ordinary API reads.
- Treat reveal, copy, plaintext export, and CLI plaintext output as high-risk actions.

## Key Management

`SM_MASTER_KEY` is required for encryption helpers and must come from the local environment or a deployment secret store.

The repository only includes placeholder variable names. Do not hard-code real keys.

## Audit Boundary

Audit events should capture actor, action, target, source, and timestamp. They must never include raw secret values.
