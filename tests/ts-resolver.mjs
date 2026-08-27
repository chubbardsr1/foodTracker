/**
 * Lets `node --test` import the application's own modules directly.
 *
 * Two small gaps stand between Node and the app's source. The app uses
 * extensionless relative imports, which Vite resolves but Node's ESM resolver
 * does not, so such a specifier is retried with `.ts`. And route handlers
 * import `cloudflare:workers`, which only exists inside the Worker runtime, so
 * it is pointed at a stub a test can put a database binding on. Node's own type
 * stripping (`--experimental-strip-types`) removes the types.
 */
const WORKER_ENV = new URL("./support/worker-env.mjs", import.meta.url).href;
const JSPDF_RECORDER = new URL("./support/jspdf-recorder.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: WORKER_ENV, format: "module", shortCircuit: true };
  }
  // jsPDF keeps its methods on the instance, so the only way to watch what a
  // PDF actually draws is to wrap the constructor. The recorder loads the real
  // library from its dist path, which this rule does not match.
  if (specifier === "jspdf") {
    return { url: JSPDF_RECORDER, format: "module", shortCircuit: true };
  }
  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    // A bare relative specifier is either a file or a directory with an index,
    // which is exactly what the bundler resolves it to.
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        return await nextResolve(candidate, context);
      } catch {
        /* try the next shape before falling back to Node's own resolution */
      }
    }
  }
  return nextResolve(specifier, context);
}
