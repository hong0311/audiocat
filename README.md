# AudioCat

[![npm version](https://badge.fury.io/js/audiocat.svg)](https://badge.fury.io/js/audiocat)
[![CI](https://github.com/yourusername/audiocat/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/audiocat/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/yourusername/audiocat/badge.svg?branch=main)](https://coveralls.io/github/yourusername/audiocat?branch=main)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern TypeScript library for audio processing in Node.js environments.

## Features

- Written in TypeScript with full type safety
- ESM and CommonJS dual package support
- Comprehensive test coverage
- Node.js 18+ support

## Installation

```bash
npm install audiocat
```

## Quick Start

```typescript
import { processAudio } from 'audiocat';

const result = await processAudio(buffer, options);
```

## Requirements

- Node.js >= 18.0.0
- npm or yarn or pnpm

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/audiocat.git
cd audiocat

# Install dependencies
npm install
```

### Available Scripts

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build the library
npm run build

# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run typecheck
```

### Project Structure

```
audiocat/
├── src/           # Source code
│   ├── index.ts   # Main entry point
│   └── *.test.ts  # Test files
├── dist/          # Built output (generated)
├── coverage/      # Test coverage reports (generated)
└── docs/          # Documentation
```

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please open an issue in the [GitHub repository](https://github.com/yourusername/audiocat/issues).
