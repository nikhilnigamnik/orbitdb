# Security

## Reporting a vulnerability

Please don't open a public issue for a security problem.

Use [GitHub's private vulnerability reporting](https://github.com/nikhilnigamnik/orbitdb/security/advisories/new) instead. It reaches the maintainer privately and gives us a place to work on a fix before it's public.

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get an acknowledgement, and credit in the release notes if you'd like it.

## What this app touches

Worth knowing when judging whether something is a vulnerability:

- **Database credentials** are stored in a JSON file in Electron's `userData` directory. Passwords and API tokens are encrypted with Electron `safeStorage`, backed by the OS keychain. Where no keychain is available the app warns and falls back to plaintext.
- **Database content is untrusted input.** Table names, column names and row values are rendered in the UI and, with the AI features enabled, are included in prompts. Anything that lets that content escape its context - reaching the shell, the filesystem, or arbitrary SQL - is a vulnerability.
- **The renderer has no Node access.** Everything crosses an IPC boundary, and only URLs with an `http`/`https` scheme are ever handed to the OS.
- **The app is not code-signed.** Installers carry no signature yet, so authenticity can't be verified from the download alone.

## Scope

In scope: anything in this repository, including the `ai-proxy/` Worker.

Out of scope: vulnerabilities in the database engines themselves, and the missing code signature (known, tracked).
