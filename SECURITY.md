# Security

## Reporting a vulnerability

Please don't open a public issue for a security problem.

Use [GitHub's private vulnerability reporting](https://github.com/nikhilnigamnik/orbitdb/security/advisories/new) instead. It reaches the maintainer privately and gives us a place to work on a fix before it's public.

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get an acknowledgement, and credit in the release notes if you'd like it.

## What this app touches

Worth knowing when judging whether something is a vulnerability:

- **Database credentials** are stored in a JSON file in Electron's `userData` directory. Passwords and API tokens are encrypted with Electron `safeStorage`, backed by the OS keychain. Where no keychain is available the app warns and falls back to plaintext.
- **Database content is untrusted input.** Table names, column names and row values are rendered in the UI and, with the AI features enabled, are included in prompts. Anything that lets that content escape its context - reaching the shell, the filesystem, or arbitrary SQL - is a vulnerability.
- **The renderer has no Node access and runs sandboxed.** Everything crosses an IPC boundary, the preload exposes only the app's own `window.api`, permission requests are denied, and only URLs with an `http`/`https` scheme are ever handed to the OS. The production content security policy allows no network origins.
- **Saved secrets never reach the renderer.** Passwords, D1 tokens and AI keys stay in the main process; the UI only learns whether one is saved. A saved password is reused only while a connection still points at the same server, so editing the host cannot send it somewhere new.
- **TLS can verify the server.** New connections verify the server certificate when SSL is on; connections saved before that option existed keep encrypting without verification until it is switched on.
- **Store files are written atomically.** A store file that fails to parse is kept aside as `<name>.corrupt-<timestamp>` rather than overwritten.
- **Exports are spreadsheet-safe.** CSV cells that would start a formula are prefixed so Excel and similar tools do not evaluate them.
- **The app is not code-signed.** Installers carry no signature yet, so authenticity can't be verified from the download alone.

## Scope

In scope: anything in this repository, including the `ai-proxy/` Worker.

Out of scope: vulnerabilities in the database engines themselves, and the missing code signature (known, tracked).
