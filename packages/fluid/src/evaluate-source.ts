import Drome from "./drome";

/**
 * Evaluate trusted sketch source synchronously with a fresh Drome.
 * This is not a sandbox: source has access to the host's JavaScript globals.
 * Source return values (including promises) are ignored; errors propagate.
 */
export function evaluateSource(code: string) {
  const d = new Drome();
  new Function("drome", "d", code)(d, d);
  return d.getSchema();
}
