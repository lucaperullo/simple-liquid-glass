/** @jest-environment jsdom */
let mockCaptures=0;
jest.mock('../vendor/ybouane/HtmlCapture',()=>({HtmlCapture:class{
 cache=new Map();dpr=1;
 async prefetchFontEmbedCSS(){}
 async captureElement(element:HTMLElement){mockCaptures++;this.cache.set(element,{canvas:{width:1,height:1},w:1,h:1})}
 destroy(){this.cache.clear()}
}}));
import { acquireSource } from '../core/webgl/source';
afterEach(()=>{document.body.replaceChildren();jest.useRealTimers()});
test('shared refresh requests coalesce; explicit mutation refresh consumes observer notification',async()=>{
 jest.useFakeTimers();mockCaptures=0;
 const el=document.createElement('div');el.innerHTML='<section>old</section>';document.body.append(el);
 const first=acquireSource(el,()=>{}),second=acquireSource(el,()=>{});
 await Promise.all([first.refresh(),second.refresh()]);expect(mockCaptures).toBe(1);
 el.firstElementChild!.textContent='new';
 await first.refresh();expect(mockCaptures).toBe(2);
 await Promise.resolve();jest.advanceTimersByTime(200);await Promise.resolve();
 expect(mockCaptures).toBe(2);
 first.release();first.release();expect(second.capture.cache.has(el)).toBe(true);second.release();
 expect(first.capture.cache.size).toBe(0);
 const third=acquireSource(el,()=>{});second.release();const fourth=acquireSource(el,()=>{});expect(third.capture).toBe(fourth.capture);third.release();fourth.release();
});
