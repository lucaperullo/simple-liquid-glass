import {createWebGLSurface} from '../../dist/webgl.esm.js';
import {createSceneCapture} from '../../src/backdrop/capture.ts';
import {acquireSource} from '../../src/core/webgl/source.ts';
import {captureSections} from '../../src/core/webgl/partialCapture.ts';
import {HtmlCapture} from '../../src/vendor/ybouane/HtmlCapture.ts';
import '../../dist/web-component.esm.js';
import {buildNativeMap} from '../../src/core/nativeOptics.ts';
import {nativeMapSurround} from '../../src/core/nativeMapGeometry.ts';
(window as any).lab={captureSections,createWebGLSurface,createSceneCapture,acquireSource,HtmlCapture,buildNativeMap,nativeMapSurround};
