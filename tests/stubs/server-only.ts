// vitest stub for the "server-only" marker package. That package throws
// unconditionally when imported outside Next.js's server-components build —
// its real job is to fail a CLIENT bundle build if server code leaks into
// it, which vitest running our server-side lib code directly under Node is
// not. See vitest.config.ts alias.
export {};
