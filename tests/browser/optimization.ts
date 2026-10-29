import {createWebGLSurface} from '../../dist/webgl.esm.js';
import {createSceneCapture} from '../../src/backdrop/capture.ts';
import {acquireSource} from '../../src/core/webgl/source.ts';
import {HtmlCapture} from '../../src/vendor/ybouane/HtmlCapture.ts';
import '../../dist/web-component.esm.js';
import {buildNativeMap} from '../../src/core/nativeOptics.ts';
import {nativeMapSurround} from '../../src/core/nativeMapGeometry.ts';
(window as any).lab={createWebGLSurface,createSceneCapture,acquireSource,HtmlCapture,buildNativeMap,nativeMapSurround};
