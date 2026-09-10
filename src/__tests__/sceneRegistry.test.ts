/** @jest-environment jsdom */
import {installScene,findScene} from '../core/sceneRegistry';

test('nearest scene wins, and cleanup restores the outer boundary',()=>{
 const outer=document.createElement('div'),inner=document.createElement('div'),panel=document.createElement('div');outer.append(inner);inner.append(panel);
 const a={register:jest.fn()},b={register:jest.fn()};
 const removeOuter=installScene(outer,a),removeInner=installScene(inner,b);
 expect(findScene(panel)).toBe(b);removeInner();expect(findScene(panel)).toBe(a);removeOuter();expect(findScene(panel)).toBeUndefined();
});
test('stale cleanup cannot remove a replacement scene',()=>{
 const root=document.createElement('div'),panel=document.createElement('div');root.append(panel);
 const a={register:jest.fn()},b={register:jest.fn()};const stale=installScene(root,a);const stop=installScene(root,b);
 stale();expect(findScene(panel)).toBe(b);stop();expect(findScene(panel)).toBeUndefined();
});
