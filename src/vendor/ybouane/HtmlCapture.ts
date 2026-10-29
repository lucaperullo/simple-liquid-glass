// Adapted from @ybouane/liquidglass 1.0.3 (MIT); see THIRD_PARTY_NOTICES.md.
/**
 * HtmlCapture — manages cached DOM-to-canvas snapshots for individual elements.
 *
 * Uses the `html-to-image` library to rasterise DOM nodes into
 * canvas-ready images.  The library handles style inlining, font
 * embedding, canvas/image conversion and all the SVG-foreignObject
 * plumbing internally.
 *
 * Static elements are captured once and cached.  Elements with the
 * `data-dynamic` attribute are re-captured every frame.
 */
import {SvgRasterCache} from '../html-to-image/SvgRasterCache';
import { StyledCloneCache } from '../html-to-image/cloneCache';
import type {PreviousPaint} from '../html-to-image/toCanvas';
import { toCanvas } from '../html-to-image/toCanvas';

interface CacheEntry {
 paint?:PreviousPaint;
	canvas: HTMLCanvasElement;
	w: number;
	h: number;
}

/**
 * Document-level cache for the prefetched + embedded @font-face blocks,
 * shared across every LiquidGlass instance on the page. The first call
 * kicks off the fetch + base64 inlining; every subsequent call returns
 * the same Promise. Cleared via `invalidateFontEmbedCache()`.
 */
let _sharedFontBlocks: Promise<EmbeddedFontBlock[]> | null = null;

/**
 * Discard the shared font-embed cache so the next prefetch rebuilds
 * it from scratch. Useful when stylesheets are added at runtime.
 */
export function invalidateFontEmbedCache(): void {
	_sharedFontBlocks = null;
}

/** A @font-face block that has already been fetched + base64-inlined. */
interface EmbeddedFontBlock {
	/** The full @font-face CSS text with data-URL src. */
	css: string;
	/** Normalised (lowercase, unquoted) font-family name. */
	family: string;
	/** Raw font-weight descriptor, e.g. "400" or "100 900". */
	weight: string;
	/** Raw font-style descriptor, e.g. "normal" or "italic". */
	style: string;
	/** Parsed unicode-range codepoint ranges, or null = all codepoints. */
	unicodeRanges: Array<[number, number]> | null;
}

// ─── @font-face descriptor parsing helpers ───

function parseFontFamily(block: string): string {
	const m = block.match(/font-family\s*:\s*(['"]?)([^;'"]+)\1/i);
	return m ? m[2].trim() : '';
}

function parseFontWeight(block: string): string {
	const m = block.match(/font-weight\s*:\s*([^;]+)/i);
	return m ? m[1].trim() : '400';
}

function parseFontStyle(block: string): string {
	const m = block.match(/font-style\s*:\s*([^;]+)/i);
	return m ? m[1].trim() : 'normal';
}

/**
 * Parse the unicode-range descriptor into an array of [start, end]
 * codepoint pairs. Returns null when no unicode-range is specified
 * (meaning the block covers all codepoints).
 */
function parseUnicodeRange(block: string): Array<[number, number]> | null {
	const m = block.match(/unicode-range\s*:\s*([^;]+)/i);
	if (!m) return null;
	const ranges: Array<[number, number]> = [];
	for (const part of m[1].split(',')) {
		const trimmed = part.trim();
		// U+0400-04FF or U+0400
		const rangeMatch = trimmed.match(/U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?/);
		if (!rangeMatch) continue;
		const start = parseInt(rangeMatch[1], 16);
		const end = rangeMatch[2] ? parseInt(rangeMatch[2], 16) : start;
		ranges.push([start, end]);
	}
	return ranges.length > 0 ? ranges : null;
}

function weightMatches(descriptor: string, target: string): boolean {
	const parts = descriptor.split(/\s+/).map(Number);
	const t = Number(target) || 400;
	if (parts.length >= 2) {
		return t >= parts[0] && t <= parts[1];
	}
	return parts[0] === t;
}

/**
 * Return true when at least one codepoint in `text` falls within
 * any of the given unicode ranges.
 */
function textMatchesUnicodeRange(
	text: string,
	ranges: Array<[number, number]>,
): boolean {
	for (let i = 0; i < text.length; i++) {
		const cp = text.codePointAt(i)!;
		for (const [lo, hi] of ranges) {
			if (cp >= lo && cp <= hi) return true;
		}
		// Skip the low surrogate of an astral codepoint.
		if (cp > 0xFFFF) i++;
	}
	return false;
}

// ─── Per-element font usage detection ───

interface FontUsage {
	family: string;
	weight: string;
	style: string;
	/** The concatenated text content rendered with this font combo. */
	text: string;
}

/**
 * Walk an element's subtree and collect the unique font-family +
 * font-weight + font-style combinations actually applied to text-
 * bearing nodes, along with the text content rendered at each
 * combination. The per-combo text is used for precise unicode-range
 * filtering: a block for "Inter weight 700 U+0400-04FF" is only
 * included if the element actually has Cyrillic text at weight 700.
 */
function collectFontUsage(element: HTMLElement): FontUsage[] {
	/** key = "family|weight|style", value = index in `fonts` */
	const indexMap = new Map<string, number>();
	const fonts: FontUsage[] = [];

	function walk(node: Node): void {
		if (node.nodeType === 3) {
			const content = node.textContent || '';
			if (content.trim() === '') return;
			const parent = node.parentElement;
			if (!parent) return;
			const style = getComputedStyle(parent);
			const weight = style.fontWeight;
			const fontStyle = style.fontStyle;
			for (const raw of style.fontFamily.split(',')) {
				const family = raw.replace(/['"]/g, '').trim().toLowerCase();
				const key = `${family}|${weight}|${fontStyle}`;
				const idx = indexMap.get(key);
				if (idx !== undefined) {
					fonts[idx].text += content;
				} else {
					indexMap.set(key, fonts.length);
					fonts.push({ family, weight, style: fontStyle, text: content });
				}
			}
		} else if (node.nodeType === 1) {
			const el = node as HTMLElement;
			for (let i = 0; i < el.childNodes.length; i++) {
				walk(el.childNodes[i]);
			}
		}
	}

	walk(element);
	return fonts;
}

/**
 * Filter a list of embedded @font-face blocks to only those that
 * are actually needed by a specific element:
 *
 *   1. The block's family + weight + style must match a computed
 *      style found on a text-bearing node inside the element.
 *   2. If the block declares a unicode-range, at least one
 *      codepoint in the *matching text* (not all text in the
 *      element — just the text rendered at that family/weight/style)
 *      must fall within it.
 *
 * This ensures that e.g. a Cyrillic-range block for "Inter 700" is
 * only included when the element actually has Cyrillic text at
 * weight 700, not just because some other text node at weight 400
 * happens to contain a Cyrillic character.
 */
function filterFontBlocksForElement(
	blocks: EmbeddedFontBlock[],
	element: HTMLElement,
): EmbeddedFontBlock[] {
	const usages = collectFontUsage(element);
	if (usages.length === 0) return [];

	return blocks.filter((block) => {
		// 1. Find all usages that match this block's family + weight +
		//    style. There may be more than one (e.g. the element has
		//    two <span>s at the same family/weight/style but the
		//    walker split them into separate text nodes — those get
		//    merged via the indexMap, so normally it's just one).
		const matchingUsages = usages.filter((u) => {
			if (u.family !== block.family) return false;
			const styleOk = block.style === u.style
				|| (block.style === 'normal' && u.style === 'normal');
			return styleOk && weightMatches(block.weight, u.weight);
		});
		if (matchingUsages.length === 0) return false;

		// 2. Unicode-range check: only test the text from matching
		//    usages, not all text in the element.
		if (block.unicodeRanges) {
			const hasMatch = matchingUsages.some(
				(u) => u.text.length > 0
					&& textMatchesUnicodeRange(u.text, block.unicodeRanges!),
			);
			if (!hasMatch) return false;
		}

		return true;
	});
}

/**
 * Fetch a URL and return it as a base64 data URL.
 * Returns null on any failure.
 */
async function fetchAsDataUrl(url: string): Promise<string | null> {
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const blob = await res.blob();
		return new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}

/**
 * Fetch every stylesheet on the page, parse @font-face rules via the
 * browser's own CSSOM (not regex), pre-filter to families the browser
 * has actually loaded, fetch each font file as a base64 data URL, and
 * return parsed + embedded blocks ready for per-element filtering at
 * capture time.
 *
 * Uses CSSStyleSheet.replace() for parsing instead of regex so we
 * correctly handle comments, multi-line src descriptors, and any
 * other edge cases the CSS spec allows inside @font-face blocks.
 */
async function buildFontBlocks(): Promise<EmbeddedFontBlock[]> {
	// 1. Collect raw @font-face rule CSS texts via CSSOM.
	const fontFaceRules: string[] = [];

	// 1a. Fetch every <link rel="stylesheet"> and parse it via a
	//     temporary CSSStyleSheet — avoids cross-origin CSSOM issues.
	const links = Array.from(
		document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
	);
	for (const link of links) {
		if (!link.href) continue;
		try {
			const res = await fetch(link.href, { cache: 'force-cache' });
			if (!res.ok) continue;
			const cssText = await res.text();
			const sheet = new CSSStyleSheet();
			await sheet.replace(cssText);
			for (const rule of sheet.cssRules) {
				if (rule.type === CSSRule.FONT_FACE_RULE) {
					fontFaceRules.push(rule.cssText);
				}
			}
		} catch {
			// Network error, CORS blocked, or replace() failed — skip.
		}
	}

	// 1b. Pick up inline same-origin @font-face rules.
	for (const sheet of Array.from(document.styleSheets)) {
		if (sheet.href) continue;
		try {
			for (const rule of Array.from(sheet.cssRules || [])) {
				if (rule.type === CSSRule.FONT_FACE_RULE) {
					fontFaceRules.push(rule.cssText);
				}
			}
		} catch {
			// SecurityError — skip.
		}
	}

	// 2. Pre-filter: only keep blocks whose font-family the browser
	//    has actually loaded. Avoids fetching font files for families
	//    the page never renders (e.g. an icon font in a stylesheet
	//    that no glass element sits on top of).
	const loadedFamilies = new Set<string>();
	if (document.fonts) {
		for (const ff of document.fonts) {
			if (ff.status === 'loaded') {
				loadedFamilies.add(
					ff.family.replace(/['"]/g, '').trim().toLowerCase(),
				);
			}
		}
	}
	const candidates = loadedFamilies.size > 0
		? fontFaceRules.filter((r) => loadedFamilies.has(parseFontFamily(r).toLowerCase()))
		: fontFaceRules;

	// 3. For each surviving rule, parse its descriptors, fetch its
	//    font file(s) as base64 data URLs, and produce an
	//    EmbeddedFontBlock.
	const embedded = await Promise.all(
		candidates.map(async (ruleText) => {
			// Replace every url(...) with a base64 data URL.
			const urlRegex = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g;
			const urlMatches = Array.from(ruleText.matchAll(urlRegex));
			let css = ruleText;
			for (const m of urlMatches) {
				const url = m[1];
				if (url.startsWith('data:')) continue;
				const dataUrl = await fetchAsDataUrl(url);
				if (dataUrl) {
					css = css.replace(m[0], `url(${dataUrl})`);
				}
			}
			return {
				css,
				family: parseFontFamily(ruleText).toLowerCase(),
				weight: parseFontWeight(ruleText),
				style: parseFontStyle(ruleText),
				unicodeRanges: parseUnicodeRange(ruleText),
			} satisfies EmbeddedFontBlock;
		}),
	);

	return embedded;
}

/** Source owns scheduling, deduplication and invalidation; this class only rasterizes. */
export class HtmlCapture {
 private disposed=false;
 readonly stats={unchanged:0};
 readonly cache=new Map<HTMLElement,CacheEntry>();
 dpr=1;
 private _fontBlocks:EmbeddedFontBlock[]=[];
 readonly clones:StyledCloneCache;
 readonly raster=new SvgRasterCache();
 constructor(readonly root:HTMLElement){this.clones=new StyledCloneCache(root)}
 async prefetchFontEmbedCSS():Promise<void>{
  _sharedFontBlocks??=buildFontBlocks();
  this._fontBlocks=await _sharedFontBlocks;
 }
 fontEmbedCSSForElement(element:HTMLElement):string{
  if(!this._fontBlocks.length)return '';
  return filterFontBlocksForElement(this._fontBlocks,element).map(b=>b.css).join('\n');
 }
 async captureElement(element:HTMLElement,force=false,reuse=false,retain=false):Promise<void>{
  if(this.disposed)return;
  const cssW=element.offsetWidth,cssH=element.offsetHeight,w=Math.round(cssW*this.dpr),h=Math.round(cssH*this.dpr);
  if(w<=0||h<=0){this.cache.delete(element);this.raster.invalidate(element);return}
  const previous=this.cache.get(element);
  if(!force&&previous?.w===w&&previous.h===h&&previous.canvas.width>0&&previous.canvas.height>0)return;
  if(element.tagName==='CANVAS')return;
  const paint=retain?{...(reuse?previous?.paint:undefined)}:undefined;
  const rendered=await toCanvas(element,{width:cssW,height:cssH,pixelRatio:this.dpr,
   style:{transform:'none',translate:'none',position:'static',margin:'0'},fontEmbedCSS:this.fontEmbedCSSForElement(element)},this.clones,reuse,this.raster,paint);
  if(!this.disposed){if(paint?.unchanged)this.stats.unchanged++;this.cache.set(element,{canvas:rendered,w,h,paint});}
 }
 destroy(){this.disposed=true;this.clones.destroy();this.raster.destroy();this.cache.clear();this._fontBlocks=[]}
}
