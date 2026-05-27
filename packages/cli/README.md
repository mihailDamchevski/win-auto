# win-auto CLI

[![npm version](https://img.shields.io/npm/v/win-auto.svg)](https://www.npmjs.com/package/win-auto)

Command-line tool for scaffolding Windows automation projects.

## Installation

```bash
npm install -g win-auto
```

## Usage

### Create a new project

```bash
win-auto init my-automation-project
cd my-automation-project
npm install
```

This creates a starter project with:

- Pre-configured TypeScript setup
- Example automation scripts
- Vitest integration for testing
- Build and test commands

## Project Structure

Generated projects include:

```
my-automation-project/
├── src/
│   └── index.ts          # Your automation code
├── tests/
│   └── example.test.ts   # Test examples
├── package.json
├── tsconfig.json
└── README.md
```

## Next Steps

1. Edit `src/index.ts` with your automation logic
2. Add tests to `tests/`
3. Run `npm run build` to compile
4. Run `npm test` to execute tests

## Examples

After creating a project, check the generated files for examples of:

- Launching applications
- Finding UI elements
- Simulating user interactions
- Writing tests

## Documentation

See the [main README](../../README.md) for complete documentation and API reference.

## License

AGPL-3.0
