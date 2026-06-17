# Liquid Glass in Plain HTML / Vanilla JavaScript

Apple's liquid glass effect—now in your static HTML, no framework required.

## One-Line Setup: CDN

Drop this single line into your `<head>`:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/simple-liquid-glass/web-component"></script>
```

That's it. The `<liquid-glass>` element auto-registers and works everywhere (no build step, no npm install, no bundler).

---

## Copy-Paste Full HTML Page

Here's a complete, working example:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Liquid Glass Demo</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 20px;
    }
    
    .container {
      position: relative;
      width: 100%;
      max-width: 400px;
    }
    
    /* Background image behind the glass */
    .background-image {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect fill="%23ff6b6b" width="200" height="150"/><rect fill="%234ecdc4" x="200" width="200" height="150"/><rect fill="%23ffe66d" y="150" width="200" height="150"/><rect fill="%2395e1d3" x="200" y="150" width="200" height="150"/></svg>');
      background-size: cover;
      z-index: 1;
    }
    
    /* The glass pane overlays the background */
    liquid-glass {
      position: relative;
      z-index: 2;
      display: block;
      width: 100%;
      height: 300px;
      margin-bottom: 20px;
    }
    
    .glass-content {
      padding: 40px 20px;
      color: #1a1a1a;
      text-align: center;
    }
    
    .glass-content h1 {
      font-size: 28px;
      margin-bottom: 10px;
      font-weight: 600;
    }
    
    .glass-content p {
      font-size: 14px;
      line-height: 1.6;
      opacity: 0.8;
    }
    
    /* Control panel below */
    .controls {
      background: rgba(0, 0, 0, 0.3);
      padding: 20px;
      border-radius: 12px;
      color: white;
      max-width: 400px;
      margin: 20px auto 0;
    }
    
    .control-group {
      margin-bottom: 15px;
      display: grid;
      grid-template-columns: 100px 1fr 50px;
      gap: 10px;
      align-items: center;
    }
    
    label {
      font-size: 13px;
      font-weight: 500;
    }
    
    input[type="range"] {
      width: 100%;
      cursor: pointer;
    }
    
    .value-display {
      font-size: 12px;
      text-align: right;
      font-weight: 600;
    }
    
    .button-group {
      display: flex;
      gap: 10px;
      margin-top: 15px;
    }
    
    button {
      flex: 1;
      padding: 8px;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.4);
      color: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
    }
    
    button:hover {
      background: rgba(255, 255, 255, 0.3);
      border-color: rgba(255, 255, 255, 0.6);
    }
    
    button:active {
      transform: scale(0.95);
    }
  </style>
  <!-- Single CDN line: auto-registers <liquid-glass> -->
  <script type="module" src="https://cdn.jsdelivr.net/npm/simple-liquid-glass/web-component"></script>
</head>
<body>
  <div class="container">
    <!-- Background that sits behind the glass -->
    <div class="background-image"></div>
    
    <!-- The glass element (height 300px, width 100% of container) -->
    <liquid-glass radius="20" frost="0.15" blur="0" saturation="140" id="glass-pane">
      <div class="glass-content">
        <h1>Liquid Glass</h1>
        <p>Real refraction on Chromium (Chrome, Edge, Opera, Brave). Frosted fallback on Safari, iOS, Firefox.</p>
      </div>
    </liquid-glass>
  </div>
  
  <!-- Interactive control panel -->
  <div class="controls">
    <h3 style="margin-bottom: 15px;">Glass Controls</h3>
    
    <div class="control-group">
      <label>Radius</label>
      <input type="range" id="radius-slider" min="0" max="50" value="20">
      <span class="value-display" id="radius-value">20px</span>
    </div>
    
    <div class="control-group">
      <label>Frost</label>
      <input type="range" id="frost-slider" min="0" max="1" step="0.05" value="0.15">
      <span class="value-display" id="frost-value">0.15</span>
    </div>
    
    <div class="control-group">
      <label>Blur</label>
      <input type="range" id="blur-slider" min="0" max="20" value="0">
      <span class="value-display" id="blur-value">0px</span>
    </div>
    
    <div class="control-group">
      <label>Saturation</label>
      <input type="range" id="saturation-slider" min="80" max="200" value="140">
      <span class="value-display" id="saturation-value">140%</span>
    </div>
    
    <div class="control-group">
      <label>Displace</label>
      <input type="range" id="displace-slider" min="0" max="20" value="5">
      <span class="value-display" id="displace-value">5</span>
    </div>
    
    <div class="control-group">
      <label>Scale</label>
      <input type="range" id="scale-slider" min="80" max="300" value="160">
      <span class="value-display" id="scale-value">160</span>
    </div>
    
    <div class="button-group">
      <button onclick="resetValues()">Reset</button>
      <button onclick="showBrowserInfo()">Browser</button>
    </div>
  </div>

  <script>
    const glassPane = document.getElementById('glass-pane');
    
    // Map slider inputs to glass attributes
    const sliderMap = [
      { sliderId: 'radius-slider', attr: 'radius', suffix: 'px', valueId: 'radius-value' },
      { sliderId: 'frost-slider', attr: 'frost', suffix: '', valueId: 'frost-value' },
      { sliderId: 'blur-slider', attr: 'blur', suffix: 'px', valueId: 'blur-value' },
      { sliderId: 'saturation-slider', attr: 'saturation', suffix: '%', valueId: 'saturation-value' },
      { sliderId: 'displace-slider', attr: 'displace', suffix: '', valueId: 'displace-value' },
      { sliderId: 'scale-slider', attr: 'scale', suffix: '', valueId: 'scale-value' }
    ];
    
    // Attach event listeners to all sliders
    sliderMap.forEach(({ sliderId, attr, suffix, valueId }) => {
      const slider = document.getElementById(sliderId);
      const display = document.getElementById(valueId);
      
      slider.addEventListener('input', (e) => {
        const value = e.target.value;
        
        // Set the attribute on the custom element
        glassPane.setAttribute(attr, value);
        
        // Update the displayed value
        display.textContent = value + suffix;
      });
    });
    
    function resetValues() {
      // Reset to default values
      glassPane.setAttribute('radius', '20');
      glassPane.setAttribute('frost', '0.15');
      glassPane.setAttribute('blur', '0');
      glassPane.setAttribute('saturation', '140');
      glassPane.setAttribute('displace', '5');
      glassPane.setAttribute('scale', '160');
      
      // Reset slider positions
      sliderMap.forEach(({ sliderId, suffix }) => {
        const slider = document.getElementById(sliderId);
        slider.value = slider.defaultValue || (sliderId === 'frost-slider' ? '0.15' : (sliderId === 'saturation-slider' ? '140' : (sliderId === 'radius-slider' ? '20' : (sliderId === 'displace-slider' ? '5' : (sliderId === 'scale-slider' ? '160' : '0')))));
      });
      
      // Re-display values
      document.getElementById('radius-value').textContent = '20px';
      document.getElementById('frost-value').textContent = '0.15';
      document.getElementById('blur-value').textContent = '0px';
      document.getElementById('saturation-value').textContent = '140%';
      document.getElementById('displace-value').textContent = '5';
      document.getElementById('scale-value').textContent = '160';
    }
    
    function showBrowserInfo() {
      const ua = navigator.userAgent;
      const isChromium = /(chrome|chromium|edg|opr)\//i.test(ua);
      const isSafari = /safari/i.test(ua) && !/chrome/i.test(ua);
      const isFirefox = /firefox/i.test(ua);
      
      let browserName = 'Unknown';
      if (isChromium) browserName = 'Chromium (real refraction)';
      else if (isSafari) browserName = 'Safari (frosted fallback)';
      else if (isFirefox) browserName = 'Firefox (frosted fallback)';
      
      alert(`Browser: ${browserName}\n\nUser Agent:\n${ua}`);
    }
  </script>
</body>
</html>
```

Save this as `index.html`, open it in a browser—done. No `npm install`, no build step.

---

## Setting & Updating Attributes via JavaScript

The `<liquid-glass>` element responds to attribute changes in real time. Modify them with vanilla JavaScript:

### Using `setAttribute()`

```javascript
// Get the element
const glass = document.getElementById('my-glass');

// Update radius (border-radius of the glass pane, in pixels)
glass.setAttribute('radius', '30');

// Update frost (opacity of the frosted overlay, 0–1)
glass.setAttribute('frost', '0.25');

// Update blur (Gaussian blur, in pixels)
glass.setAttribute('blur', '5');

// Update saturation (color saturation boost, in %)
glass.setAttribute('saturation', '160');

// Update displace (displacement map intensity, 0–20)
glass.setAttribute('displace', '8');

// Update scale (refraction scale factor, 0–300)
glass.setAttribute('scale', '200');

// Update lightness (brightness of the glass body, 0–100)
glass.setAttribute('lightness', '60');

// Update alpha (opacity of the glass layer, 0–1)
glass.setAttribute('alpha', '0.85');

// Update border color (any CSS color string)
glass.setAttribute('border-color', 'rgba(200, 100, 100, 0.8)');

// New in 3.0.0 ---------------------------------------------------------------

// Update angle (refraction direction in degrees, shape-adapted)
glass.setAttribute('angle', '45');

// Toggle shape-adapt (aspect-faithful + isotropic; "false" = legacy ≤2.x map)
glass.setAttribute('shape-adapt', 'false');

// Update lens field shape ("classic" | "convex" | "shift" | "rim")
glass.setAttribute('lens', 'convex');

// Update lens-strength (magnitude of the lens field; 0 disables it)
glass.setAttribute('lens-strength', '1.5');

// Update lens-center for convex/rim ("x,y", each 0–1)
glass.setAttribute('lens-center', '0.3,0.7');

// Update liquid (real animated refraction: "ripple" | "flow" | "wobble")
glass.setAttribute('liquid', 'ripple');

// Update liquid-speed (motion rate)
glass.setAttribute('liquid-speed', '1.5');

// Update liquid-scale (distortion amplitude in px)
glass.setAttribute('liquid-scale', '12');
```

### Reading Attributes Back

```javascript
const glass = document.getElementById('my-glass');

const radius = glass.getAttribute('radius');          // "30"
const frost = glass.getAttribute('frost');            // "0.25"
const blur = glass.getAttribute('blur');              // "5"
const saturation = glass.getAttribute('saturation');  // "160"
```

### Real-Time Slider Example

```javascript
const slider = document.getElementById('frost-control');
const glass = document.getElementById('my-glass');

slider.addEventListener('input', (e) => {
  glass.setAttribute('frost', e.target.value);
});
```

---

## Complete Attribute Reference

All attributes are **optional**. Sensible defaults ship with the component.

| Attribute | Type | Default | Range/Notes |
|-----------|------|---------|-------------|
| `radius` | number | `50` | Border radius in pixels (0–999) |
| `frost` | number | `0.1` | Opacity of the frosted overlay (0–1) |
| `blur` | number | `0` | Gaussian blur in pixels (0–50) |
| `saturation` | number | `140` | Color saturation boost in % (0–200) |
| `displace` | number | `5` | Displacement map intensity (0–20) |
| `scale` | number | `160` | Refraction scale factor (0–300) |
| `lightness` | number | `53` | Brightness of the glass, 0–100 (HSL lightness) |
| `alpha` | number | `0.9` | Overall opacity of the glass layer (0–1) |
| `border-color` | string | `"rgba(120,120,120,0.7)"` | Any valid CSS color (hex, rgb, rgba, hsl, etc.) |
| `angle` | number | `0` | **New in 3.0.0.** Refraction direction in degrees. Shape-adapted so the on-screen angle stays faithful on any aspect ratio (Chromium SVG path) |
| `shape-adapt` | string | `"on"` | **New in 3.0.0.** Aspect-faithful + isotropic refraction so the lens reads like glass cut to the element's shape (a long navbar / tall sidebar refracts evenly). Set `"false"` to disable and use the legacy ≤2.x map |
| `lens` | string | `"classic"` | **New in 3.0.0.** Lens field shape: `classic` (linear radial), `convex` (one coherent dome magnifier, no top/bottom split), `shift` (uniform directional offset, straight lines stay straight), `rim` (clear flat center, refraction only at a soft perimeter band) |
| `lens-strength` | number | `1` | **New in 3.0.0.** Manual magnitude of the lens field; `0` disables it |
| `lens-center` | string | `"0.5,0.5"` | **New in 3.0.0.** Lens center for `convex`/`rim`, as `"x,y"` with each value 0–1 |
| `liquid` | string | — | **New in 3.0.0.** Real animated refraction—the backdrop genuinely warps: `ripple`, `flow`, or `wobble`. Opt-in, GPU-real: animates only while on-screen, pauses on `prefers-reduced-motion`, Chromium SVG path only |
| `liquid-speed` | number | `1` | **New in 3.0.0.** Motion rate for `liquid` |
| `liquid-scale` | number | — | **New in 3.0.0.** Distortion amplitude in px for `liquid` (defaults per preset) |

### Default Element in Action

```html
<!-- Uses all defaults: radius=50, frost=0.1, blur=0, saturation=140, etc. -->
<liquid-glass>Your content</liquid-glass>

<!-- Mix defaults with custom values -->
<liquid-glass radius="24" frost="0.2">Your content</liquid-glass>

<!-- New in 3.0.0: a coherent dome magnifier with a 45° refraction direction -->
<liquid-glass radius="24" lens="convex" angle="45">Your content</liquid-glass>
```

---

## Browser Behavior: Honest Comparison

### Chromium (Chrome, Edge, Opera, Brave, Arc, Vivaldi)
- **Real SVG-displacement refraction** in `backdrop-filter`
- Everything behind the glass warps and distorts in real time
- Attributes `displace` and `scale` control the intensity and scale of the refraction

### Safari, iOS, Firefox
- **Polished frosted-glass fallback**: blur, saturation boost, subtle sheen gradient
- No live displacement—browser engines don't support SVG filters in `backdrop-filter`
- Still looks premium and matches the glass aesthetic, just not the true refraction warp
- The `displace` and `scale` attributes have no effect on non-Chromium engines

**Why?** WebKit (Safari/iOS) and Firefox can't run SVG `feDisplacementMap` inside `backdrop-filter`. They can do it in a regular element `filter`, but the web component doesn't have access to a background element by default—that's why the React `<LiquidGlass>` component offers a `backdropRef` prop for true refraction on those engines (see "Real Refraction on iOS / Safari (React)" below).

---

## jQuery & Plain Script Setup

No jQuery? No problem. All examples above use plain ES6. If your page does use jQuery, here's how to integrate:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
  <script type="module" src="https://cdn.jsdelivr.net/npm/simple-liquid-glass/web-component"></script>
  <style>
    liquid-glass { width: 300px; height: 200px; display: block; }
  </style>
</head>
<body>
  <liquid-glass id="glass-pane" radius="20" frost="0.15"></liquid-glass>
  
  <button id="increase-frost">Increase Frost</button>
  <button id="reset">Reset</button>

  <script>
    // jQuery way: use attr() to get/set attributes
    $('#increase-frost').on('click', function() {
      const current = parseFloat($('#glass-pane').attr('frost')) || 0.15;
      $('#glass-pane').attr('frost', Math.min(current + 0.1, 1));
    });
    
    $('#reset').on('click', function() {
      $('#glass-pane').attr('frost', '0.15');
    });
    
    // You can also use plain JavaScript directly (recommended)
    const glass = document.getElementById('glass-pane');
    glass.setAttribute('radius', '30');
  </script>
</body>
</html>
```

---

## Angular Integration (CUSTOM_ELEMENTS_SCHEMA)

By default, Angular throws warnings about unknown elements. Tell Angular that `<liquid-glass>` is a valid custom element:

### Step 1: Import the side-effect module

```typescript
// app.component.ts
import 'simple-liquid-glass/web-component'; // side-effect: registers <liquid-glass>
```

### Step 2: Add CUSTOM_ELEMENTS_SCHEMA to your component

```typescript
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

@Component({
  selector: 'app-glass-demo',
  template: `
    <liquid-glass 
      radius="24" 
      frost="0.2" 
      blur="2"
      [attr.saturation]="saturation$ | async"
      style="width: 400px; height: 280px; display: block;">
      <div style="padding: 40px;">
        <h2>Liquid Glass in Angular</h2>
        <p>Dynamic attributes work with Angular bindings.</p>
      </div>
    </liquid-glass>
  `,
  styles: [`
    :host { display: flex; justify-content: center; }
  `],
  schemas: [CUSTOM_ELEMENTS_SCHEMA] // <-- Allow custom elements
})
export class GlassDemoComponent {
  saturation$ = new BehaviorSubject(140);
  
  changeSaturation(value: number) {
    this.saturation$.next(value);
  }
}
```

### Step 3: Bind attributes and properties

```typescript
// Works with string binding
<liquid-glass radius="30"></liquid-glass>

// Works with property binding (use [attr.x] syntax)
<liquid-glass [attr.radius]="currentRadius"></liquid-glass>

// Works with async bindings and observables
<liquid-glass [attr.frost]="frostLevel$ | async"></liquid-glass>
```

### Full Angular Example with Slider

```typescript
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import 'simple-liquid-glass/web-component';

@Component({
  selector: 'app-glass-slider',
  template: `
    <div style="text-align: center; padding: 40px;">
      <liquid-glass 
        [attr.radius]="radius$ | async"
        [attr.frost]="frost$ | async"
        style="width: 400px; height: 280px; display: block; margin: 0 auto;">
        <div style="padding: 40px; color: #333;">
          <h2>Glass with Slider</h2>
          <p>Move the slider to update the glass in real time.</p>
        </div>
      </liquid-glass>
      
      <div style="margin-top: 20px;">
        <label>
          Radius: {{ radius$ | async }}
          <input 
            type="range" 
            min="0" 
            max="50" 
            [value]="radius$ | async"
            (input)="setRadius($event)">
        </label>
        <br>
        <label>
          Frost: {{ frost$ | async }}
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.05"
            [value]="frost$ | async"
            (input)="setFrost($event)">
        </label>
      </div>
    </div>
  `,
  styles: [`
    label { display: block; margin: 10px 0; }
    input { width: 200px; margin-left: 10px; }
  `],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class GlassSliderComponent {
  radius$ = new BehaviorSubject(20);
  frost$ = new BehaviorSubject(0.15);
  
  setRadius(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.radius$.next(parseFloat(value));
  }
  
  setFrost(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.frost$.next(parseFloat(value));
  }
}
```

---

## Real Refraction on iOS / Safari (React)

The web component uses the frosted-glass fallback on Safari and iOS because it doesn't have access to the background element. If you're building a React app and need **true refraction on iOS/Safari**, use the React component with `backdropRef`:

```jsx
import { useRef } from 'react';
import { LiquidGlass } from 'simple-liquid-glass';

function Card() {
  const backgroundRef = useRef(null);
  
  return (
    <div style={{ position: 'relative' }}>
      {/* The element behind the glass */}
      <div ref={backgroundRef}>
        <img src="background.jpg" alt="bg" />
      </div>
      
      {/* The glass pane with a reference to the background */}
      <LiquidGlass backdropRef={backgroundRef} radius={24} frost={0.15}>
        <h2>True Refraction on iOS!</h2>
      </LiquidGlass>
    </div>
  );
}

export default Card;
```

With `backdropRef`, Safari and iOS show real refraction—the background element is cloned and displaced inside the glass, just like Chromium. No `backdropRef` = frosted fallback.

---

## Size & Performance

- **Web component**: ~6 KB (gzip), zero runtime dependencies
- **Auto-registers**: just one CDN `<script type="module">` line
- **SSR-safe**: only touches the DOM in the browser
- **Responsive**: automatically re-renders on resize
- **No layout thrashing**: uses ResizeObserver, not polling

---

## Common Patterns

### Glossy Card Overlay

```html
<style>
  .card-container {
    position: relative;
    width: 300px;
    height: 200px;
    background: url('card-bg.jpg') center/cover;
  }
</style>

<div class="card-container">
  <liquid-glass radius="12" frost="0.12" style="width: 100%; height: 100%; display: block;">
    <div style="padding: 20px;">
      <h3>Card Title</h3>
      <p>Content layered over background image with liquid glass effect.</p>
    </div>
  </liquid-glass>
</div>
```

### Animated Buttons

```html
<liquid-glass 
  radius="8" 
  frost="0.2" 
  id="glass-button"
  style="width: 120px; height: 40px; display: inline-block; cursor: pointer;">
  <div style="text-align: center; line-height: 40px; color: white;">Click Me</div>
</liquid-glass>

<script>
  const btn = document.getElementById('glass-button');
  btn.addEventListener('click', () => alert('Clicked!'));
  btn.addEventListener('mouseenter', () => btn.setAttribute('frost', '0.3'));
  btn.addEventListener('mouseleave', () => btn.setAttribute('frost', '0.2'));
</script>
```

### Dynamic Theme Switching

```javascript
const glass = document.getElementById('glass');

function applyTheme(theme) {
  if (theme === 'dark') {
    glass.setAttribute('lightness', '20');
    glass.setAttribute('saturation', '100');
  } else if (theme === 'light') {
    glass.setAttribute('lightness', '85');
    glass.setAttribute('saturation', '140');
  }
}

// Switch on button click
document.getElementById('dark-mode').addEventListener('click', () => applyTheme('dark'));
document.getElementById('light-mode').addEventListener('click', () => applyTheme('light'));
```

---

## Troubleshooting

### "The component isn't showing up"

1. **Check the CDN script tag**: Make sure it's in your `<head>` and uses `type="module"`.
   ```html
   <script type="module" src="https://cdn.jsdelivr.net/npm/simple-liquid-glass/web-component"></script>
   ```

2. **Set explicit size**: `<liquid-glass>` needs `width` and `height`. Use CSS:
   ```html
   <liquid-glass style="width: 300px; height: 200px; display: block;"></liquid-glass>
   ```

3. **Use a background**: The glass effect is most visible over a gradient or image. Place it in a container with a background.

### "I don't see a refraction effect, just a blur"

That's normal on Safari and Firefox. The web component shows the frosted fallback on non-Chromium browsers (Chrome, Edge, Opera, Brave, Arc all show real refraction). If you're on Chromium and still don't see it:

- Ensure `displace` and `scale` are not 0
- Try adjusting `saturation` higher
- Check browser DevTools to confirm the element is rendering

### "Attributes aren't updating"

Ensure you're using the correct attribute name and syntax:

```javascript
// ❌ Wrong
glass.radius = '30';

// ✅ Right
glass.setAttribute('radius', '30');
```

Attribute names are kebab-case: `border-color`, not `borderColor`.

### "Angular keeps complaining about unknown element"

You need both steps:
1. Import the side-effect module: `import 'simple-liquid-glass/web-component'`
2. Add `CUSTOM_ELEMENTS_SCHEMA` to your component decorator

---

## Links & Resources

- **Live Demo**: https://simple-liquid-glass.vercel.app/
- **GitHub**: https://github.com/lucaperullo/simple-liquid-glass
- **npm Package**: https://www.npmjs.com/package/simple-liquid-glass
- **Changelog**: https://github.com/lucaperullo/simple-liquid-glass/blob/main/CHANGELOG.md
- **React Component Docs**: See the main README for `<LiquidGlass>` and `<LiquidGlassInteractive>` (real iOS refraction, pointer tracking)
- **Web Component CDN**: https://cdn.jsdelivr.net/npm/simple-liquid-glass/web-component

---

## License

MIT — use freely in personal and commercial projects.

---

**Built with zero dependencies. Works offline once cached. Ship it.**
