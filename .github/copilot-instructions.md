# Project Guidelines

## Development Model

- This repository assumes AI-driven development with GitHub Copilot in VS Code.
- Prefer executable Copilot requests over instructions that require users to transcribe code manually.
- For each implementation task, derive tests from the Issue acceptance criteria, make the change, run the required validation commands, and report changed files, results, and residual risks.
- Stop before committing, pushing, merging, deploying, or changing remote settings unless the user explicitly requests that action.
- Keep environment-specific IDs, credentials, and secrets out of source code, Issues, Pull Requests, chat, and terminal history.
- Before adding or updating third-party GitHub Actions, verify the current stable version and runner requirements from the action's official README and Releases page. Report the source URLs and verification date; do not guess from memory or copy an unverified sample.

## CI/CD Guide

- Treat `CICD実装手順書.md` as the canonical implementation and operations guide.
- Keep the guide executable from start to finish: every required file, command, Copilot request, human-only setting, verification criterion, failure stop condition, deployment check, and rollback step must be documented in execution order.
- When application behavior changes, add or update tests that directly prove the corresponding Issue acceptance criteria.
- Mock Power Apps SDK and environment-dependent boundaries in Pull Request tests. Keep authenticated real-environment verification separate and record its result after deployment.

## Validation

- Run commands from `my-app` unless the guide states otherwise.
- Before committing application changes, run `npm run lint`, `npm run test:ci`, and `npm run build`.
- Do not treat missing tests, skipped validation, HTTP 200 responses, or successful publication alone as proof that acceptance criteria passed.
