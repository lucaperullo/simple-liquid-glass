/** @jest-environment jsdom */
import { CaptureStyles, canShareStyles } from '../vendor/html-to-image/captureStyles';

test('resource URLs remain inline for the image embedder, while each snapshot owns its values', () => {
  const root = document.createElement('div'), child = document.createElement('div');root.append(child);
  const styles = new CaptureStyles();
  for (const node of [root, child]) styles.add(node, new Map([['color', 'red'], ['background-image', 'url("/image.png")'], ['mask-image', 'url("/mask.svg")']]));
  styles.apply(root);
  expect(child.style.backgroundImage).toContain('/image.png');expect(child.style.maskImage).toContain('/mask.svg');
  expect(root.querySelector('style')!.textContent).toMatch(/color:\s*red[;}]/);
  const next = document.createElement('div'), nextStyles = new CaptureStyles();
  nextStyles.add(next,new Map([['color','blue']]));nextStyles.apply(next);
  expect(next.querySelector('style')!.textContent).toMatch(/color:\s*blue[;}]/);
  expect(root.querySelector('style')!.textContent).toMatch(/color:\s*red[;}]/);
});

test('different node values remain local and do not leak into the shared rule', () => {
  const root=document.createElement('div'),a=document.createElement('div'),b=document.createElement('div');root.append(a,b);
  const styles=new CaptureStyles();styles.add(a,new Map([['color','red'],['opacity','1']]));styles.add(b,new Map([['color','blue'],['opacity','1']]));styles.apply(root);
  expect(a.style.color).toBe('red');expect(b.style.color).toBe('blue');expect(root.querySelector('style')!.textContent).not.toContain('color');
});

test('trees with their own styles, special media, SVG, or shadow composition keep upstream capture', () => {
  const root=document.createElement('div');root.innerHTML='<p>ordinary <b>text</b></p>';expect(canShareStyles(root)).toBe(true);
  for(const tag of ['style','link','canvas','video','iframe','svg','slot','template','x-glass']) {const el=tag==='svg'?document.createElementNS('http://www.w3.org/2000/svg','svg'):document.createElement(tag);root.replaceChildren(el);expect(canShareStyles(root)).toBe(false);}
  const host=document.createElement('div');host.attachShadow({mode:'open'});root.replaceChildren(host);expect(canShareStyles(root)).toBe(false);
});

test('common background and mask declarations remain available to the shorthand embedder',()=>{
 const root=document.createElement('div'),child=document.createElement('div');root.append(child);
 const values=new Map([['background-color','red'],['background-image','url("/image.png")'],['background-size','20px 20px'],['background-repeat','repeat'],['background-position','0% 0%'],['background-origin','padding-box'],['background-clip','border-box'],['background-attachment','scroll'],['mask-image','url("/mask.svg")'],['mask-size','cover'],['color','blue']]);
 const styles=new CaptureStyles();styles.add(root,new Map(values));styles.add(child,new Map(values));styles.apply(root);
 for(const node of[root,child]){expect(node.style.getPropertyValue('background-size')).toBe('20px 20px');expect(node.style.getPropertyValue('background-repeat')).toBe('repeat');expect(node.style.getPropertyValue('mask-size')).toBe('cover');}
 expect(root.querySelector('style')!.textContent).not.toContain('background-');expect(root.querySelector('style')!.textContent).not.toContain('mask-');
});

test('repeated components share only their matching computed declarations',()=>{
 const root=document.createElement('section'),a=document.createElement('div'),b=document.createElement('div');
 a.className=b.className='tile';root.append(a,b);
 const styles=new CaptureStyles();
 styles.add(root,new Map([['color','black'],['border-top-width','1px'],['border-top-style','solid']]));
 styles.add(a,new Map([['color','red'],['border-top-width','2px'],['border-top-style','solid']]));
 styles.add(b,new Map([['color','blue'],['border-top-width','2px'],['border-top-style','solid']]));
 styles.apply(root);document.body.append(root);
 try{
  expect(a.style.borderTopWidth).toBe('');expect(b.style.borderTopWidth).toBe('');
  expect(getComputedStyle(a).borderTopWidth).toBe('2px');expect(getComputedStyle(b).borderTopWidth).toBe('2px');
  expect(getComputedStyle(root).borderTopWidth).toBe('1px');
  expect(a.style.color).toBe('red');expect(b.style.color).toBe('blue');
 }finally{root.remove()}
});
