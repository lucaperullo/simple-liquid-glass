# Simple Liquid Launcher showcase

Official public showcase for the Android launcher, in its own folder. Uses the same Vite/React foundation as the Simple Liquid Text showcase.

- Site: https://launcher.lucaperullo.it/
- Companion showcases: https://glass.lucaperullo.it/ and https://text.lucaperullo.it/
- Run `npm ci`, then `npm run dev` (port 4192). `npm run build` checks TypeScript and produces `dist`.
- Deploy with `vercel --prod` from this directory after linking the `simple-liquid-launcher` project.

The download is the original supplied 0.8.0 APK, unchanged, with SHA-256 `c3b874dcb9a26464bf2f41e17abdbe0855b69b91c935b0766304c813d534212a`. Release metadata is defined in `src/main.tsx`; public installation instructions use the actual Android label, Liquid Glass. This is a development-signed preview for Android 13+, not a store release.

Actual 0.8.0 emulator screenshots, the launcher icon and the three bundled wallpapers come from the Android app project. Feature copy is grounded in its README, manifest and validation notes. No claims of physical-device performance are made. Media credits are in `public/media/credits.txt`.

The landing page centers one interactive web launcher built with renderer-enabled simple-liquid-glass. It includes native SVG and automatic iOS WebGL backdrop refraction, app search, a folder preview, app/dock previews, a local clock, an illustrative weather widget and three switchable wallpapers. It does not launch real Android apps. The immersive wallpaper opening leads into a pinned capsule reveal, staggered launcher assembly and stacked full-screen wallpaper panels. GSAP ScrollTrigger and Lenis coordinate the scroll sequence on desktop and mobile. The visual reference is Capsules by Moyra (https://capsules.moyra.co/); assets and implementation belong to this launcher showcase. Reduced-motion mode disables smooth scrolling, reveals and pinned staging; the launcher stays usable without the reveal. CSS minification is disabled to retain the unprefixed backdrop-filter declaration. Download links serve the APK directly and family links connect all three public showcases.

The page hero CTA and launcher search use the same real Glass component as the launcher tiles. The family section preloads 500px before visibility and includes a live glass music player and real simple-liquid-text glyph refraction; audio pauses when the previews leave view.

September imagery/editorial update: the previous 647px-wide portrait web crops have been replaced in the hero, live web demo and artwork panels with native 1672×941 landscape studies. The APK and its original wallpapers are unchanged. An accordion shows actual app screenshots; the download instructions sit in a real LiquidGlass panel.

All live glass panels explicitly bind to sibling background layers: the opening artwork, each phone’s own wallpaper, the interactive launcher wallpaper, and the family preview images. Wallpaper changes refresh the cached source. The installation panel uses a separate matching paper background. The web preview supports real-time iOS WebGL; HTML/image backgrounds use automatically refreshed snapshots, while direct video/canvas sources update live. CSS3D phone transforms and physical iOS devices still require visual verification. This web support does not change the native Android APK.
