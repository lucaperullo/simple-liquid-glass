/** @jest-environment jsdom */
import { subscribeFrame } from '../core/webgl/contextPool';

let next=0;
let pending:Map<number,FrameRequestCallback>;
let stop:Array<()=>void>;
beforeEach(()=>{
 pending=new Map();stop=[];
 jest.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{pending.set(++next,callback);return next;});
 jest.spyOn(window,'cancelAnimationFrame').mockImplementation(id=>{pending.delete(id);});
});
afterEach(()=>{for(const unsubscribe of stop)unsubscribe();jest.restoreAllMocks();});
const tick=()=>{const [id,callback]=pending.entries().next().value!;pending.delete(id);callback(16.7);};

test('all position reads finish before any surface writes',()=>{
 const calls:string[]=[];
 stop.push(subscribeFrame(()=>calls.push('write-a'),()=>calls.push('read-a')));
 stop.push(subscribeFrame(()=>calls.push('write-b'),()=>calls.push('read-b')));
 tick();expect(calls).toEqual(['read-a','read-b','write-a','write-b']);
});

test('a surface removed during presentation is not rendered from stale measurements',()=>{
 const calls:string[]=[];let stopB:()=>void=()=>{};
 stop.push(subscribeFrame(()=>{calls.push('write-a');stopB();},()=>calls.push('read-a')));
 stopB=subscribeFrame(()=>calls.push('write-b'),()=>calls.push('read-b'));stop.push(stopB);
 tick();expect(calls).toEqual(['read-a','read-b','write-a']);
});

test('legacy callbacks without a measurement phase still run and the final unsubscribe stops the ticker',()=>{
 const render=jest.fn(),off=subscribeFrame(render);stop.push(off);
 tick();expect(render).toHaveBeenCalledTimes(1);expect(pending.size).toBe(1);
 off();expect(pending.size).toBe(0);
});
