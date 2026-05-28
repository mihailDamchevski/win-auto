# Contributing to win-auto

First off, thanks for taking the time to contribute! 🎉

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- Rust toolchain (install from https://rustup.rs)

### Development Setup

```powershell
# Clone the repository
git clone https://github.com/mihailDamchevski/win-auto.git
cd win-auto

# Install dependencies
npm install

# Build all packages
npm run build
```

## Development Workflow

### Build

```powershell
# Build TypeScript packages
npm run build -w @win-auto/core
npm run build -w win-auto

# Build native addon
npm run build:native

# Build everything
npm run build
```

### Testing

```powershell
# Run unit tests
npm run test

# Run E2E tests with mock runtime
npm run test:e2e

# Run E2E tests with real Notepad
npm run test:e2e:real
```

### Linting & Formatting

```powershell
# ESLint (recommended rules)
npm run lint

# TypeScript type-check
npm run typecheck

# Prettier formatting
npm run format

# Check formatting without writing
npm run format:check
```

### Cleaning

```powershell
npm run clean
```

## Code Style

- Use TypeScript for all code
- Follow the existing code structure and naming conventions
- Add tests for new functionality
- Keep commits atomic and descriptive

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Add/update tests as needed
5. Run tests and linting: `npm run test && npm run lint`
6. Commit with clear messages
7. Push to your fork
8. Open a Pull Request

## Commit Message Format

Use clear, descriptive commit messages:

- `feat: add new feature`
- `fix: resolve issue with X`
- `docs: update documentation`
- `test: add tests for feature`
- `refactor: restructure code`

## Reporting Issues

Before creating an issue, check existing issues to avoid duplicates.

When reporting issues, include:

- Clear description of the issue
- Steps to reproduce
- Expected behavior
- Actual behavior
- System information (OS, Node version, etc.)
- Error messages and logs

## Roadmap

See `docs/ROADMAP.md` for the full implementation plan. Completed phases:

- ✅ **Q1–Q5** — Quick wins (structured errors, typed events, missing emissions, stale recovery, mock filtering)
- ✅ **P1** — Foundation hardening (TS error hierarchy, COM init, stale recovery v2, events)
- ✅ **P2** — Element discovery (healing engine, LegacyIAccessible, className, structural navigation)
- ✅ **P3** — Fluent wait API (wait.until, inverse waits, compound conditions, adaptive polling)
- ✅ **P9** — Rust core hardening (structured errors, event watcher, OLE drag-drop, CreateProcessW, parallel template matching)

Active priorities:

- **P4** — Dual input mode (hardware + pattern-based input)
- **P5** — Image recognition (FFT matching, multi-scale, OCR)
- **P6** — Legacy app toolkit (DirectUI, WM_COMMAND, AUMID launch)
- **P7** — Mock backend fidelity (tree-aware lookup, state simulation)
- **P8** — Testing infrastructure (negative matchers, polling assertions, snapshots)
- **P10** — Cross-cutting (UIPI, diagnostics, config expansion, diagnose CLI)

## Questions or Need Help?

Open an issue with the `question` label or check existing discussions.

Thank you for contributing to win-auto!
