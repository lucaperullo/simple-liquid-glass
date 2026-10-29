/** Package entries are independently bundled; share document resources across those entries. */
export function sharedValue<T>(name: string, create: () => T): T {
  const scope = (typeof document !== 'undefined' ? document : typeof globalThis !== 'undefined' ? globalThis : {}) as unknown as Record<symbol, unknown>;
  const key = Symbol.for(`simple-liquid-glass.${name}`);
  return (scope[key] ??= create()) as T;
}
