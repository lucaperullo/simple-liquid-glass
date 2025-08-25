import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface LiquidGlassThreeProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: number;
  height?: number;
  dpr?: number;
  backgroundColor?: string;
  backgroundSrc?: string; // optional background image
  imageSrc?: string; // foreground image to tilt slightly with mouse
  trackMouse?: boolean;
  mouseMomentum?: number; // 0..1 lerp factor per frame (0 immediate, 1 never moves)
  // Circle passes
  darkenAmount?: number; // 0..1
  darkenRadius?: number; // normalized half-size
  darkenPos?: { x: number; y: number }; // normalized
  lightenAmount?: number; // 0..1
  lightenRadius?: number; // normalized half-size
  lightenPos?: { x: number; y: number }; // normalized
  lightenColor?: string; // additive color
  // Lens
  lensEnabled?: boolean;
  lensRadius?: number; // normalized scale factor for falloff mapping
  lensDispersion?: number; // chromatic dispersion base
  lensMaskFromImageAlpha?: boolean; // modulate lens opacity by image alpha
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A WebGL/Three.js replication of the Unicorn Studio "Liquid Glass" animation.
 * It composes multiple full-screen shader passes:
 * 1) Base compose of background + image with slight mouse tilt
 * 2) Darken radial vignette (multiply-style)
 * 3) Lighten radial vignette (add-style)
 * 4) Refractive circular lens with subtle chromatic dispersion at mouse
 */
export function LiquidGlassThree({
  width = 480,
  height = 480,
  dpr,
  backgroundColor = '#d0d0d0',
  backgroundSrc,
  imageSrc = 'https://firebasestorage.googleapis.com/v0/b/unicorn-studio.appspot.com/o/Zz28X5RDkvcGGVYLr9X6QdTIhxy1%2FTulips%20in%20dreamy%20light%20blue%20sky.png?alt=media&token=ac293af7-9939-45e6-afa1-0c9b2028e096',
  trackMouse = true,
  mouseMomentum = 0.12,
  darkenAmount = 0.2,
  darkenRadius = 0.248,
  darkenPos = { x: 0.5, y: 0.282 },
  lightenAmount = 0.35,
  lightenRadius = 0.208,
  lightenPos = { x: 0.5, y: 0.37 },
  lightenColor = '#d0d0d0',
  lensEnabled = true,
  lensRadius = 0.492,
  lensDispersion = 0.01,
  lensMaskFromImageAlpha = true,
  className,
  style,
  ...rest
}: LiquidGlassThreeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0px';
    containerRef.current.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true });
    const targetDpr = dpr ?? Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(targetDpr);
    renderer.setSize(width, height, false);

    // Targets for ping-pong passes
    const rtOpts: THREE.WebGLRenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
    };
    let targetA = new THREE.WebGLRenderTarget(width * targetDpr, height * targetDpr, rtOpts);
    let targetB = new THREE.WebGLRenderTarget(width * targetDpr, height * targetDpr, rtOpts);

    // Common scene + camera for full-screen passes
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.PlaneGeometry(2, 2);

    // Utilities
    const resolution = new THREE.Vector2(width * targetDpr, height * targetDpr);
    const resolutionNorm = new THREE.Vector2(width, height);

    // Mouse tracking (normalized 0..1 in canvas space)
    const mouse = new THREE.Vector2(0.5, 0.5);
    const mouseTarget = new THREE.Vector2(0.5, 0.5);
    const updateMouse = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      mouseTarget.set(THREE.MathUtils.clamp(x, 0, 1), THREE.MathUtils.clamp(y, 0, 1));
    };
    if (trackMouse) {
      const onMove = (e: PointerEvent) => updateMouse(e.clientX, e.clientY);
      window.addEventListener('pointermove', onMove);
      // Initialize with center
      updateMouse(window.innerWidth / 2, window.innerHeight / 2);
      // Cleanup listener later
      (renderer as any).__onMove = onMove;
    }

    // Textures
    const textureLoader = new THREE.TextureLoader();
    const backgroundTex = backgroundSrc ? textureLoader.load(backgroundSrc) : null;
    if (backgroundTex) {
      backgroundTex.colorSpace = THREE.SRGBColorSpace;
      backgroundTex.minFilter = THREE.LinearFilter;
      backgroundTex.magFilter = THREE.LinearFilter;
    }
    const imageTex = imageSrc ? textureLoader.load(imageSrc) : null;
    if (imageTex) {
      imageTex.colorSpace = THREE.SRGBColorSpace;
      imageTex.minFilter = THREE.LinearFilter;
      imageTex.magFilter = THREE.LinearFilter;
      imageTex.wrapS = THREE.ClampToEdgeWrapping;
      imageTex.wrapT = THREE.ClampToEdgeWrapping;
    }

    // Convert lighten color
    const lightenColorVec = new THREE.Color(lightenColor);
    const bgColor = new THREE.Color(backgroundColor);

    // Base compose material (background + image tilt)
    const baseUniforms = {
      uResolution: { value: resolution.clone() },
      uMouse: { value: mouse.clone() },
      uBgTexture: { value: backgroundTex },
      uUseBgTexture: { value: backgroundTex ? 1 : 0 },
      uBgColor: { value: new THREE.Vector3(bgColor.r, bgColor.g, bgColor.b) },
      uImage: { value: imageTex },
      uUseImage: { value: imageTex ? 1 : 0 },
    } as const;
    const baseMaterial = new THREE.ShaderMaterial({
      uniforms: baseUniforms as any,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform vec2 uResolution;
        uniform vec2 uMouse;
        uniform sampler2D uBgTexture;
        uniform int uUseBgTexture;
        uniform vec3 uBgColor;
        uniform sampler2D uImage;
        uniform int uUseImage;

        vec2 rotate2D(vec2 p, float a){
          float s = sin(a), c = cos(a);
          return mat2(c, -s, s, c) * p;
        }

        void main() {
          vec2 uv = vUv;
          vec3 color = uBgColor;

          if (uUseBgTexture == 1) {
            color = texture2D(uBgTexture, uv).rgb;
          }

          if (uUseImage == 1) {
            // Slight parallax/tilt driven by mouse
            vec2 center = vec2(0.5);
            vec2 delta = (uMouse - center);
            float angleX = (uMouse.y * 0.5 - 0.25);
            float angleY = ((1.0 - uMouse.x) * 0.5 - 0.25);
            vec2 tuv = uv - center;
            tuv = rotate2D(tuv, angleX * 0.2);
            tuv += delta * -0.03;
            tuv += center;

            vec4 img = texture2D(uImage, tuv);
            // Alpha composite over background
            float a = clamp(img.a, 0.0, 1.0);
            color = mix(color, img.rgb / max(a, 0.0001), a);
          }

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    // Darken circle (multiply-like)
    const darkenUniforms = {
      uTexture: { value: targetA.texture },
      uResolution: { value: resolutionNorm.clone() },
      uCenter: { value: new THREE.Vector2(darkenPos.x, darkenPos.y) },
      uRadius: { value: darkenRadius },
      uAmount: { value: darkenAmount },
    } as const;
    const darkenMaterial = new THREE.ShaderMaterial({
      uniforms: darkenUniforms as any,
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform vec2 uResolution;
        uniform vec2 uCenter;
        uniform float uRadius;
        uniform float uAmount;
        void main(){
          vec3 col = texture2D(uTexture, vUv).rgb;
          // Aspect-aware distance
          vec2 ar = vec2(uResolution.x/uResolution.y, 1.0);
          // Small rotation to better match reference (~0.0054 * TWO_PI)
          float ang = 0.0339;
          float s = sin(ang), c0 = cos(ang);
          mat2 rot = mat2(c0, -s, s, c0);
          vec2 p = (vUv * ar) * rot;
          vec2 c = (uCenter * ar) * rot;
          float d = distance(p, c);
          float inner = uRadius * 0.5;
          float outer = uRadius * 1.5;
          float falloff = 1.0 - smoothstep(inner, outer, d);
          vec3 blended = col * (1.0 - uAmount);
          vec3 finalCol = mix(col, blended, falloff * uAmount);
          gl_FragColor = vec4(finalCol, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    // Lighten circle (add-like)
    const lightenUniforms = {
      uTexture: { value: targetB.texture },
      uResolution: { value: resolutionNorm.clone() },
      uCenter: { value: new THREE.Vector2(lightenPos.x, lightenPos.y) },
      uRadius: { value: lightenRadius },
      uAmount: { value: lightenAmount },
      uAddColor: { value: new THREE.Vector3(lightenColorVec.r, lightenColorVec.g, lightenColorVec.b) },
    } as const;
    const lightenMaterial = new THREE.ShaderMaterial({
      uniforms: lightenUniforms as any,
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform vec2 uResolution;
        uniform vec2 uCenter;
        uniform float uRadius;
        uniform float uAmount;
        uniform vec3 uAddColor;
        void main(){
          vec3 col = texture2D(uTexture, vUv).rgb;
          vec2 ar = vec2(uResolution.x/uResolution.y, 1.0);
          // Opposite small rotation (~-0.0054 * TWO_PI)
          float ang = -0.0339;
          float s = sin(ang), c0 = cos(ang);
          mat2 rot = mat2(c0, -s, s, c0);
          vec2 p = (vUv * ar) * rot;
          vec2 c = (uCenter * ar) * rot;
          float d = distance(p, c);
          float inner = uRadius * 0.5;
          float outer = uRadius * 1.5;
          float falloff = 1.0 - smoothstep(inner, outer, d);
          vec3 addCol = uAddColor;
          vec3 blended = col + addCol;
          vec3 finalCol = mix(col, blended, falloff * uAmount);
          gl_FragColor = vec4(finalCol, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    // Refractive lens at mouse with chromatic dispersion
    const lensUniforms = {
      uTexture: { value: targetA.texture },
      uMouse: { value: mouse.clone() },
      uResolution: { value: resolutionNorm.clone() },
      uEnabled: { value: lensEnabled ? 1 : 0 },
      uLensRadius: { value: lensRadius },
      uDispersion: { value: lensDispersion },
      uImage: { value: imageTex },
      uUseImage: { value: imageTex ? 1 : 0 },
      uMaskFromAlpha: { value: lensMaskFromImageAlpha ? 1 : 0 },
    } as const;
    const lensMaterial = new THREE.ShaderMaterial({
      uniforms: lensUniforms as any,
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform vec2 uMouse;
        uniform vec2 uResolution;
        uniform int uEnabled;
        uniform float uLensRadius;
        uniform float uDispersion;
        uniform sampler2D uImage;
        uniform int uUseImage;
        uniform int uMaskFromAlpha;

        vec2 rotate2D(vec2 p, float a){
          float s = sin(a), c = cos(a);
          return mat2(c, -s, s, c) * p;
        }

        void main(){
          vec3 base = texture2D(uTexture, vUv).rgb;
          if (uEnabled == 0) { gl_FragColor = vec4(base, 1.0); return; }

          vec2 ar = vec2(uResolution.x/uResolution.y, 1.0);
          vec2 uv = vUv;
          vec2 center = uMouse;
          vec2 st = (uv - center);
          vec2 stA = st * ar;

          // Signed distance to a normalized circle
          float r = uLensRadius; // normalized radius baseline
          float d = length(stA) - r;

          // Displace vector (avoid division by 0)
          float eps = 1e-4;
          vec2 dir = normalize(st + vec2(eps));
          float inv = 1.0 / max(abs(d), 0.001);
          vec2 offset = dir * inv * 0.01; // base refraction strength

          // Chromatic offsets
          float rd = uDispersion * 1.00;
          float gd = uDispersion * 1.00;
          float bd = uDispersion * 1.20;

          vec3 refr;
          refr.r = texture2D(uTexture, uv + offset * rd).r;
          refr.g = texture2D(uTexture, uv + offset * gd).g;
          refr.b = texture2D(uTexture, uv + offset * bd).b;

          // Soft opacity at lens boundary
          float opacity = smoothstep(0.0, 0.0025, -d);

          // Optional masking by foreground image alpha (parallax-matched)
          if (uMaskFromAlpha == 1 && uUseImage == 1) {
            vec2 centerUV = vec2(0.5);
            vec2 delta = (uMouse - centerUV);
            float angleX = (uMouse.y * 0.5 - 0.25);
            vec2 tuv = uv - centerUV;
            tuv = rotate2D(tuv, angleX * 0.2);
            tuv += delta * -0.03;
            tuv += centerUV;
            float a = texture2D(uImage, tuv).a;
            opacity *= a * a;
          }

          vec3 finalCol = mix(base, refr, opacity);
          gl_FragColor = vec4(finalCol, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    // Mesh for rendering passes
    const mesh = new THREE.Mesh(quad, baseMaterial);
    scene.add(mesh);

    // Resize handling
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        const newW = Math.max(1, Math.floor(cr.width));
        const newH = Math.max(1, Math.floor(cr.height));
        renderer.setSize(newW, newH, false);
        const pr = dpr ?? Math.min(window.devicePixelRatio || 1, 2);
        const pxW = Math.floor(newW * pr);
        const pxH = Math.floor(newH * pr);
        targetA.dispose();
        targetB.dispose();
        targetA = new THREE.WebGLRenderTarget(pxW, pxH, rtOpts);
        targetB = new THREE.WebGLRenderTarget(pxW, pxH, rtOpts);
        (darkenUniforms as any).uTexture.value = targetA.texture;
        (lightenUniforms as any).uTexture.value = targetB.texture;
        (lensUniforms as any).uTexture.value = targetA.texture;
        (baseUniforms as any).uResolution.value.set(pxW, pxH);
        resolution.set(pxW, pxH);
        resolutionNorm.set(newW, newH);
        (darkenUniforms as any).uResolution.value.set(newW, newH);
        (lightenUniforms as any).uResolution.value.set(newW, newH);
        (lensUniforms as any).uResolution.value.set(newW, newH);
      }
    });
    resizeObserver.observe(containerRef.current);

    let rafId = 0;
    const render = () => {
      // Mouse smoothing
      mouse.lerp(mouseTarget, mouseMomentum);

      // Update uniforms
      (baseUniforms as any).uMouse.value.copy(mouse);
      (lensUniforms as any).uMouse.value.copy(mouse);

      // Pass 0: base compose -> A
      mesh.material = baseMaterial;
      renderer.setRenderTarget(targetA);
      renderer.render(scene, camera);

      // Pass 1: darken -> B
      mesh.material = darkenMaterial;
      renderer.setRenderTarget(targetB);
      renderer.render(scene, camera);

      // Pass 2: lighten -> A
      mesh.material = lightenMaterial;
      renderer.setRenderTarget(targetA);
      renderer.render(scene, camera);

      // Pass 3: lens -> screen
      mesh.material = lensMaterial;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);

      rafId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      if ((renderer as any).__onMove) {
        window.removeEventListener('pointermove', (renderer as any).__onMove);
      }
      scene.remove(mesh);
      mesh.geometry.dispose();
      baseMaterial.dispose();
      darkenMaterial.dispose();
      lightenMaterial.dispose();
      lensMaterial.dispose();
      targetA.dispose();
      targetB.dispose();
      renderer.dispose();
      if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, dpr, backgroundColor, backgroundSrc, imageSrc, trackMouse, mouseMomentum, darkenAmount, darkenRadius, darkenPos.x, darkenPos.y, lightenAmount, lightenRadius, lightenPos.x, lightenPos.y, lightenColor, lensEnabled, lensRadius, lensDispersion, lensMaskFromImageAlpha]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', width, height, overflow: 'hidden', ...style }}
      {...rest}
    />
  );
}

export default LiquidGlassThree;