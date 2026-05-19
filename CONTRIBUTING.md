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
git clone https://github.com/yourusername/win-auto.git
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

### Linting

```powershell
npm run lint
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

## Questions or Need Help?

Open an issue with the `question` label or check existing discussions.

Thank you for contributing to win-auto!
