/** @jest-environment jsdom */
const mockGenerate = jest.fn(() => `data:image/png;base64,map-${mockGenerate.mock.calls.length}`);
const mockDispose = jest.fn();
jest.mock('../vendor/samasante/displacement', () => ({createLensMapGenerator: () => ({generate: mockGenerate, dispose: mockDispose})}));
import {buildNativeMap, resolveLensOptions, NATIVE_PROFILES, LENS_OPTION_RANGES} from '../core/nativeOptics';
import type {LensOptions} from '../core/nativeOptics';

test('omitted options preserve every existing profile', () => {
 for(const profile of Object.keys(NATIVE_PROFILES) as (keyof typeof NATIVE_PROFILES)[]){
  expect(resolveLensOptions(profile)).toEqual({...NATIVE_PROFILES[profile],glowSpread:1,brightness:0});
 }
});
test('all controls accept explicit zero, clamp ranges and ignore non-finite input', () => {
 for(const key of Object.keys(LENS_OPTION_RANGES) as (keyof LensOptions)[]){
  const [min,max]=LENS_OPTION_RANGES[key];
  expect(resolveLensOptions('player',{[key]:-Infinity})[key]).toBe(resolveLensOptions('player')[key]);
  expect(resolveLensOptions('player',{[key]:NaN})[key]).toBe(resolveLensOptions('player')[key]);
  expect(resolveLensOptions('player',{[key]:-999})[key]).toBe(min);
  expect(resolveLensOptions('player',{[key]:999})[key]).toBe(max);
  expect(resolveLensOptions('player',{[key]:0})[key]).toBe(Math.max(0,min));
 }
});
test('geometry overrides regenerate the map, but strength, specular and brightness reuse it', () => {
 const base=buildNativeMap(337,221,24,'player');
 expect(buildNativeMap(337,221,24,'player',{specular:2,strength:.3,brightness:.5})).toBe(base);
 for(const key of ['depth','curvature','bend','bendWidth','sheen','sheenWidth','sheenFalloff','sheenAngle','glow','glowSpread','glowFalloff'] as (keyof LensOptions)[]){
  const value=resolveLensOptions('player')[key]*.8+.001;
  expect(buildNativeMap(337,221,24,'player',{[key]:value})).not.toBe(base);
  expect(mockGenerate.mock.calls.at(-1)?.[0]).toMatchObject({[key]:value});
 }
 expect(mockDispose).toHaveBeenCalledTimes(mockGenerate.mock.calls.length);
});
