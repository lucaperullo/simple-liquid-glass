/**
 * The bundled worker (`worker.ts`) as text. Empty in the source tree: the build replaces this module with
 * the real text (see the `next-worker-source` plugin in rollup.config.js). Code running straight from
 * source therefore draws on the page thread unless it is given a `workerUrl`.
 */
export const WORKER_SOURCE = '' as string;
