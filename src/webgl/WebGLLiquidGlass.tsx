import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface WebGLLiquidGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  imageSrc: string;
  width?: number;
  height?: number;
  dpi?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * WebGLLiquidGlass replicates the provided Unicorn Studio composition using a minimal
 * Three.js ping-pong composer with custom shader passes.
 */
export default function WebGLLiquidGlass({
  imageSrc,
  width = 512,
  height = 512,
  dpi = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1,
  className,
  style,
  ...rest
}: WebGLLiquidGlassProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererRef.current = renderer;
    renderer.setPixelRatio(dpi);
    renderer.setSize(width, height, false);
    container.appendChild(renderer.domElement);

    const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    scene.add(quad);

    const rtOpts: THREE.WebGLRenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
    };
    const rtA = new THREE.WebGLRenderTarget(width * dpi, height * dpi, rtOpts);
    const rtB = new THREE.WebGLRenderTarget(width * dpi, height * dpi, rtOpts);

    const mouse = new THREE.Vector2(0.5, 0.5);
    const resolution = new THREE.Vector2(width * dpi, height * dpi);

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      mouse.set(THREE.MathUtils.clamp(x, 0, 1), THREE.MathUtils.clamp(y, 0, 1));
    };
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    const textureLoader = new THREE.TextureLoader();
    const imageTexture = textureLoader.load(imageSrc);
    imageTexture.minFilter = THREE.LinearFilter;
    imageTexture.magFilter = THREE.LinearFilter;
    imageTexture.wrapS = THREE.ClampToEdgeWrapping;
    imageTexture.wrapT = THREE.ClampToEdgeWrapping;

    const fullScreenVS = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const gradientFS = `
      precision highp float;
      varying vec2 vUv;
      uniform vec2 uMousePos;
      vec3 getColor(vec2 uv) { return vec3(0.8156863); }
      void main() {
        gl_FragColor = vec4(getColor(vUv), 1.0);
      }
    `;

    const imageFS = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uBgTexture;
      uniform sampler2D uTexture;
      uniform vec2 uMousePos;
      uniform int uSampleBg;
      void main() {
        vec2 uv = vUv;
        vec2 pos = mix(vec2(0.0), (uMousePos - 0.5), 0.0);
        uv -= pos;
        vec4 color = texture2D(uTexture, uv);
        vec4 background = vec4(0.0);
        if (uSampleBg == 1) {
          background = texture2D(uBgTexture, vUv);
        }
        color = mix(background, color / max(color.a, 0.0001), color.a * 1.0);
        gl_FragColor = color;
      }
    `;

    const circleFS = (mode: 1 | 3, halfRadius: number, posY: number, amount: number, rotSign: number) => `
      precision mediump float;
      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform vec2 uMousePos;
      uniform vec2 uResolution;
      vec3 blend(int blendMode, vec3 src, vec3 dst) { ${mode === 3 ? 'return src * dst;' : 'return src + dst;'} }
      mat2 rot(float a){ return mat2(cos(a),-sin(a),sin(a),cos(a)); }
      void main(){
        vec2 uv = vUv;
        vec4 color = texture2D(uTexture, uv);
        float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        float displacement = (luma - 0.5) * 0.0 * 0.5;
        vec2 aspect = vec2(uResolution.x/uResolution.y, 1.0);
        vec2 skew = vec2(0.5, 1.0 - 0.5);
        float innerEdge = ${halfRadius.toFixed(4)} - 1.0 * ${halfRadius.toFixed(4)} * 0.5;
        float outerEdge = ${halfRadius.toFixed(4)} + 1.0 * ${halfRadius.toFixed(4)} * 0.5;
        vec2 pos = vec2(0.5, ${posY.toFixed(4)});
        pos += (uMousePos - 0.5) * 1.0;
        const float TWO_PI = 6.28318530718;
        vec2 scaledUV = uv * aspect * rot(${(rotSign * 0.0054).toFixed(4)} * TWO_PI) * skew;
        vec2 scaledPos = pos * aspect * rot(${(rotSign * 0.0054).toFixed(4)} * TWO_PI) * skew;
        float radius = distance(scaledUV, scaledPos);
        float falloff = smoothstep(innerEdge + displacement, outerEdge + displacement, radius);
        falloff = 1.0 - falloff;
        vec3 blended = blend(${mode}, ${mode === 1 ? 'vec3(0.8156863)' : 'vec3(0.0)'}, color.rgb);
        vec3 finalColor = mix(color.rgb, blended, falloff * ${amount.toFixed(4)});
        float finalAlpha = mix(1.0 - falloff, 1.0, 1.0);
        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `;

    const sdfFS = `
      precision mediump float;
      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform sampler2D uMaskTexture;
      uniform vec2 uMousePos;
      uniform vec2 uResolution;
      const float PI = 3.14159265359;
      mat2 rot(float a){ return mat2(cos(a),-sin(a),sin(a),cos(a)); }
      float sdCircle(vec2 uv, float r){ return length(uv) - r; }
      float getDistance(vec2 uv){ return sdCircle(uv, 0.4); }
      float getDist(vec2 st){
        float sd = getDistance(st);
        vec2 aspect = vec2(uResolution.x/uResolution.y, 1.0);
        vec2 mousePos = (uMousePos * aspect);
        float mouseDistance = length(vUv * aspect - mousePos);
        float falloff = smoothstep(0.0, 0.8, mouseDistance);
        float asd = -2.0;
        float md = mix(0.02/falloff, 0.1/falloff, -asd * sd);
        md = md * 1.5 * 0.0; // disabled displacement as in provided code
        md = min(-md, 0.0);
        sd -= md;
        return sd;
      }
      vec4 refrakt(float sd, vec2 st, vec4 bg){
        vec2 offset = mix(vec2(0.0), normalize(st)/sd, length(st));
        vec4 r = vec4(0.0,0.0,0.0,1.0);
        float rdisp = mix(0.01, 0.008, 0.5);
        float gdisp = mix(0.01, 0.01, 0.5);
        float bdisp = mix(0.01, 0.012, 0.5);
        vec2 uv = (vUv - 0.5) / mix(1.0, 4.0, 0.0) + 0.5;
        r.r = texture2D(uTexture, uv + offset * (1.0 - 0.5) * rdisp).r;
        r.g = texture2D(uTexture, uv + offset * (1.0 - 0.5) * gdisp).g;
        r.b = texture2D(uTexture, uv + offset * (1.0 - 0.5) * bdisp).b;
        float opacity = smoothstep(0.0, 0.0025, -sd);
        vec4 background = bg;
        return mix(background, r, opacity);
      }
      void main(){
        vec2 uv = vUv;
        vec4 bg = texture2D(uTexture, uv);
        vec2 aspect = vec2(uResolution.x/uResolution.y, 1.0);
        vec2 mousePos = (uMousePos - 0.5);
        vec2 st = uv - (vec2(0.5, 0.5) + mousePos);
        st *= aspect;
        st *= 1.0/(0.4920 + 0.2);
        st *= rot(-0.0027 * 2.0 * PI);
        float eps = 0.0005;
        float sd = getDist(st);
        vec4 r = refrakt(sd, st, bg);
        vec2 maskPos = mix(vec2(0.0), (uMousePos - 0.5), 0.0);
        vec4 maskColor = texture2D(uMaskTexture, vUv - maskPos);
        gl_FragColor = r * (maskColor.a * maskColor.a);
      }
    `;

    // Materials
    const gradientMat = new THREE.ShaderMaterial({
      vertexShader: fullScreenVS,
      fragmentShader: gradientFS,
      uniforms: {
        uMousePos: { value: mouse },
      },
    });

    const imageMat = new THREE.ShaderMaterial({
      vertexShader: fullScreenVS,
      fragmentShader: imageFS,
      uniforms: {
        uMousePos: { value: mouse },
        uTexture: { value: imageTexture },
        uBgTexture: { value: rtA.texture },
        uSampleBg: { value: 1 },
      },
      transparent: true,
    });

    const circle1Mat = new THREE.ShaderMaterial({
      vertexShader: fullScreenVS,
      fragmentShader: circleFS(3, 0.2480 * 0.5, 0.2820, 0.2, +1),
      uniforms: {
        uMousePos: { value: mouse },
        uTexture: { value: rtB.texture },
        uResolution: { value: resolution },
      },
      transparent: true,
    });

    const circle2Mat = new THREE.ShaderMaterial({
      vertexShader: fullScreenVS,
      fragmentShader: circleFS(1, 0.2080 * 0.5, 0.37, 0.35, -1),
      uniforms: {
        uMousePos: { value: mouse },
        uTexture: { value: rtA.texture },
        uResolution: { value: resolution },
      },
      transparent: true,
    });

    const sdfMat = new THREE.ShaderMaterial({
      vertexShader: fullScreenVS,
      fragmentShader: sdfFS,
      uniforms: {
        uMousePos: { value: mouse },
        uTexture: { value: rtB.texture },
        uMaskTexture: { value: rtB.texture },
        uResolution: { value: resolution },
      },
      transparent: true,
    });

    function renderPass(target: THREE.WebGLRenderTarget | null, material: THREE.ShaderMaterial) {
      quad.material = material;
      renderer.setRenderTarget(target);
      renderer.render(scene, orthoCamera);
      renderer.setRenderTarget(null);
    }

    let rafId = 0;
    const animate = () => {
      // 1) gradient -> rtA
      renderPass(rtA, gradientMat);
      // 2) image(bg=rtA, img=image) -> rtB
      imageMat.uniforms.uBgTexture.value = rtA.texture;
      imageMat.uniforms.uTexture.value = imageTexture;
      renderPass(rtB, imageMat);
      // 3) circle1(input=rtB) -> rtA
      circle1Mat.uniforms.uTexture.value = rtB.texture;
      renderPass(rtA, circle1Mat);
      // 4) circle2(input=rtA) -> rtB
      circle2Mat.uniforms.uTexture.value = rtA.texture;
      renderPass(rtB, circle2Mat);
      // 5) sdf refract(input=rtB, mask=rtB) -> screen
      sdfMat.uniforms.uTexture.value = rtB.texture;
      sdfMat.uniforms.uMaskTexture.value = rtB.texture;
      renderPass(null, sdfMat);

      rafId = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const w = width;
      const h = height;
      renderer.setPixelRatio(dpi);
      renderer.setSize(w, h, false);
      rtA.setSize(w * dpi, h * dpi);
      rtB.setSize(w * dpi, h * dpi);
      resolution.set(w * dpi, h * dpi);
    };
    onResize();

    return () => {
      cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      container.removeChild(renderer.domElement);
      rtA.dispose();
      rtB.dispose();
      quad.geometry.dispose();
      gradientMat.dispose();
      imageMat.dispose();
      circle1Mat.dispose();
      circle2Mat.dispose();
      sdfMat.dispose();
      renderer.dispose();
    };
  }, [imageSrc, width, height, dpi]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width, height, position: 'relative', ...style }}
      {...rest}
    />
  );
}

