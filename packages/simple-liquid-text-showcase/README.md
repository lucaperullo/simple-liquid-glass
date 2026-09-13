# Simple Liquid Text showcase

Public companion to [Simple Liquid Glass](https://glass.lucaperullo.it), built around the same Through Glass coastal imagery, typography, paper surfaces, and material atelier.

- Website: https://text.lucaperullo.it
- Package: https://www.npmjs.com/package/simple-liquid-text
- Uses the renderer-enabled `simple-liquid-text` release.

Run `npm ci` and `npm run dev` for the preview on port 4187. `npm run build` checks TypeScript and builds the Vite site. Deploy with `vercel --prod` from this directory; the existing project is `simple-liquid-text`.

Media is reused from the companion showcase. Attribution is in `public/media/credits.txt`. The live studio supports film playback, scrolling content, fonts, words, refraction, dispersion, blur, border, fill, and shadow. Reduced-motion preferences prevent initial autoplay.

The page also uses the renderer-enabled `simple-liquid-glass` for its portal, music player, draggable notes, and chapter dock. The component skins and interactions are carried over from the original showcase.

`npm run test:production` builds and tests the actual production output: native text refraction on a paused film, displacement over sharp content, and mobile glass interactions. CSS minification is disabled because the default optimizer removed the standard `backdrop-filter` declaration while preserving only its WebKit-prefixed form.

The hero replicates the original Through Glass composition with a single refracting “Liquid text.” headline. Below it, one text line loops over dunes with selectable fonts and a pause control. The looping lens prepares at startup and stays mounted so returning to the hero does not rebuild it. Its animation pauses offscreen. The workbench prepares within 500px of the viewport. Reduced motion disables automatic text motion.

Plain placeholders and unfinished lenses keep their layout space but remain hidden until ready. The hero reveal starts after its lens is ready. Supported browsers drive hero scroll transforms through a CSS view timeline; other browsers use the scroll fallback. Print, forced colors, and reduced-transparency modes retain readable ordinary text.

Real-time iOS WebGL is enabled with `renderer="auto"` and explicit sibling background sources. The opening headline and portal sample the opening video directly; the player samples its film, notes and font specimens sample their images, and the workbench switches between its direct video and scrollable HTML background. Video/canvas frames update live without per-frame React state; HTML sources use cached snapshots that refresh automatically. The fixed chapter dock has its own matching gradient background source. Native SVG remains available on Chromium; unavailable renderers retain the library fallback. Real iOS device verification is still needed.
