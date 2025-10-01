# Agent Guidelines for NPG (Node Package Guard)

## Commands
- **Test**: `pnpm test` (runs all tests) or `NODE_ENV=test node --test --test-reporter spec path/to/specific.test.js` (single test)
- **Test with coverage**: `pnpm run test:cov`
- **Lint**: `npx eslint .` (uses @antfu/eslint-config)
- **Dev**: `pnpm dev` (starts with nodemon)

## Code Style
- **ES Modules**: Use `import/export` syntax, file extension `.js`
- **Imports**: Node.js modules with `node:` prefix (`import fs from 'node:fs/promises'`)
- **Naming**: camelCase for variables/functions, kebab-case for files
- **Async**: Prefer `async/await` over promises, use `try/catch` for error handling
- **Comments**: JSDoc style for functions, inline for complex logic
- **Plugins**: Use `fastify-plugin` wrapper with `fp()` and explicit `name` option
- **Logging**: Use `fastify.log` methods (info, warn, error, debug)
- **Config**: Import from `./config.js`, destructure options as needed

## Error Handling
- Return structured error objects with `code()`, `send()` for HTTP responses
- Use `reply.code(statusCode).send({ error: 'message' })` pattern
- Catch and log errors appropriately, don't expose internal details

## Testing
- Use Node.js built-in test runner (`node --test`)
- Test files in `test/` directory with `.test.js` suffix
- Set `NODE_ENV=test` for test runs