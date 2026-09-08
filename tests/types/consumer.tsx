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
