/**
 * Whether this build stacks layers: several layers drawn into one canvas, each over the glass of those
 * before it, which its material can read (`slg_below`). Off in `simple-liquid-glass/next`, whose code for it
 * is dropped when it is built; on in `simple-liquid-glass/next/stack`, the same engine built with this file
 * swapped for one that says `true` (see rollup.config.js).
 */
export const STACKING = false as boolean;
