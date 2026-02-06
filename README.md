# mabp-coordinator

Multi-Agent Build Protocol (MABP) coordinator for orchestrating parallel builds from Owl specs.

## Features

- Parses Owl specification files (product.md, components/*.md)
- Manages CLAIM → ACK → BUILD → READY → AUDIT → MERGED workflow
- Tracks component dependencies
- Coordinates multiple agents building in parallel

## Usage

```bash
npm install
npm run build
node dist/index.js <owl-spec-dir>
```

## Protocol Flow

1. **CLAIM** - Agent claims a component to build
2. **ACK** - Coordinator acknowledges the claim
3. **BUILD** - Agent builds the component
4. **READY** - Agent announces completion
5. **AUDIT** - Other agents review the work
6. **MERGED** - Component integrated into main

## License

MIT
