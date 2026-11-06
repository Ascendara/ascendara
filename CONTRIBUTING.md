# Contributing to Ascendara

Thanks for helping out. This guide covers the basics for working on this repository. Please
follow the [Code of Conduct](./CODE_OF_CONDUCT.md) in all project spaces.

## Getting set up

1. Fork the repository and clone your fork.
2. Install Node dependencies with `yarn` (or `npm install`). This also sets up the Husky
   git hooks.
3. Install Python dependencies with `pip install -r requirements.txt`.
4. Start the app in development mode with `yarn start`.

The `.env` file is optional. See the "Running from Source" section of the
[README](./README.md) and the [Developer Docs](https://ascendara.app/docs/developer/build-from-source)
for details and known limitations of development builds.

## Branches and pull requests

- Branch off `development` and open your pull request against `development`, not `main`.
- Keep each pull request focused on one change, and explain what it does and why.
- Fill in the pull request template, including how you tested the change.

## Code style

- Formatting uses Prettier (`.prettierrc`). The pre-commit hook runs Prettier on staged
  files. You can also run `yarn format:check` or `yarn format`.
- Linting uses ESLint (`eslint.config.js`). Run `yarn lint` before opening a pull request.

## Tests

- JavaScript tests use the built-in Node test runner: `yarn test` (runs
  `node --test tests/*.test.cjs`). Add or update tests in `tests/` when you change behavior.
- Python tests in `tests/` use `unittest`, for example
  `python3 -m unittest discover -s tests -p 'test_*.py'`.

## Building

- Windows: `yarn dist`
- Linux: `yarn dist-linux`, see [README_LINUX_BUILD.md](./README_LINUX_BUILD.md)
- macOS: `yarn dist-mac`, see [README_MAC_BUILD.md](./README_MAC_BUILD.md)

## Reporting bugs and security issues

- Use the issue templates for bugs and feature requests.
- Do not report security vulnerabilities in public issues. See [SECURITY.md](./SECURITY.md).
