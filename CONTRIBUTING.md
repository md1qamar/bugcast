# Contributing to BugCast

Thank you for helping improve BugCast!

## Development Setup

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Pull Request Checklist

- Keep changes focused and modular.
- Add or update automated tests under `test/` for new functionality or bug fixes.
- Ensure `npm run typecheck`, `npm run build`, and `npm test` pass cleanly.
- Never commit secrets, `.env` files, or `.bugcast/` capture artifacts.
