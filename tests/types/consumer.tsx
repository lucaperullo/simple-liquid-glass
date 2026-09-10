import React, { createRef } from 'react';
import { LiquidGlass, type LiquidGlassHandle, type LiquidGlassProps } from 'simple-liquid-glass';
import { LiquidGlassInteractive, usePointerElastic } from 'simple-liquid-glass/interactive';
import { LiquidGlassMirror } from 'simple-liquid-glass/mirror';
import { defineLiquidGlass } from 'simple-liquid-glass/web-component';
const ref = createRef<LiquidGlassHandle>();
const props: LiquidGlassProps = { quality: 'high', mode: 'custom', effectMode: 'blur', angle: 45, shapeAdapt: true, lens: 'convex', lensStrength: .8, lensCenter: [.4,.6], liquid: 'ripple', liquidSpeed: 1, liquidScale: 5, refraction: 'lens', displacementScale: 80 };
const elements = [<LiquidGlass {...props} ref={ref} />, <LiquidGlassInteractive elasticity={0.2} ref={ref} />, <LiquidGlassMirror force ref={ref} />];
// @ts-expect-error invalid quality must remain rejected in the published declarations
const invalid = <LiquidGlass quality="ultra" />;
defineLiquidGlass('typed-glass');
void elements; void invalid; void usePointerElastic;
const customized = <LiquidGlass lensOptions={{depth:.15,curvature:.45,bend:.55,bendWidth:.3,sheen:2,sheenWidth:10,sheenAngle:0,specular:1.6,glow:.1,brightness:0}} />;
const interactiveOptics = <LiquidGlassInteractive lensOptions={{strength:.14,glowFalloff:1.5}} />;
// @ts-expect-error lens controls are numeric
const invalidOptics = <LiquidGlass lensOptions={{depth:'deep'}} />;
void customized; void interactiveOptics; void invalidOptics;
const material = <LiquidGlass material="smoked" onDiagnosticsChange={diagnostics => { const strategy: string = diagnostics.strategy; void strategy; }} />;
ref.current?.getDiagnostics().reason;
// @ts-expect-error unknown materials must be rejected
const invalidMaterial = <LiquidGlass material="plastic" />;
void material; void invalidMaterial;

const gpu = <LiquidGlass renderer="webgl" backdropSelector="#background" backdropVersion={1} />;
const interactiveGpu = <LiquidGlassInteractive renderer="webgl" backdropSelector="#background" />;
ref.current?.refreshBackdrop().then(() => {});
// @ts-expect-error unsupported renderer
const invalidRenderer = <LiquidGlass renderer="canvas2d" />;
void gpu; void interactiveGpu; void invalidRenderer;

import { createWebGLSurface, type WebGLSurfaceOptions } from 'simple-liquid-glass/webgl';
const surfaceOptions: WebGLSurfaceOptions = { map: '', scale: 80, dispersion: 1, specular: 0,
  classic: false, additiveDispersion: true, neutralPoint: 128/255, radius: 0, blur: 0, saturation: 100 };
void createWebGLSurface; void surfaceOptions;

import {LiquidGlassScene,useLiquidGlassBackdrop,createLiquidGlassBackdrop} from 'simple-liquid-glass/backdrop';
const scene = <LiquidGlassScene maxCacheBytes={64*1024*1024} onCaptureError={(error,section)=>{void error;void section}}><LiquidGlass /></LiquidGlassScene>;
void scene;void useLiquidGlassBackdrop;void createLiquidGlassBackdrop;
