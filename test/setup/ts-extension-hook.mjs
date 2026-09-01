// Minimal Node module-resolution hook, used only by the test runner
// (see test/setup/register-ts-loader.mjs and package.json's "test" script).
//
// The app's own src/ files use extensionless relative imports throughout
// (e.g. `from '../types'`), which Vite/tsc resolve for the app build, but
// Node's native ESM loader requires an explicit extension even with its
// built-in TypeScript type-stripping. Rather than adding `.ts` extensions
// across the existing source tree (a large, unrelated change), this hook
// retries an unresolved relative/absolute specifier with a `.ts`/`.tsx`
// suffix before giving up — so regression tests can import the real
// application modules unmodified.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const isPathSpecifier = specifier.startsWith('.') || specifier.startsWith('/');
    if (isPathSpecifier && err?.code === 'ERR_MODULE_NOT_FOUND') {
      for (const ext of ['.ts', '.tsx']) {
        try {
          return await nextResolve(specifier + ext, context);
        } catch {
          // try the next extension
        }
      }
    }
    throw err;
  }
}
