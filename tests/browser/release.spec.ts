import {test,expect} from '@playwright/test';
test('new default and existing 4.1 directional and animated controls coexist',async({page,browserName})=>{
 test.skip(browserName!=='chromium');
 await page.goto('/tests/browser/release.html');
 const legacy=page.getByTestId('legacy');
 await expect.poll(()=>page.getByTestId('default').locator('feDisplacementMap').first().getAttribute('scale')).toBe('80');
 await expect(legacy.locator('feDisplacementMap').first()).toHaveAttribute('scale','160');
 const before=await legacy.locator('feImage').getAttribute('href');
 await page.getByText('Rotate',{exact:true}).click();
 await expect.poll(()=>legacy.locator('feImage').getAttribute('href')).not.toBe(before);
 const frequency=await legacy.locator('feTurbulence').getAttribute('baseFrequency');
 await expect.poll(()=>legacy.locator('feTurbulence').getAttribute('baseFrequency')).not.toBe(frequency);
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(legacy.locator('feTurbulence')).toHaveCount(0);
 await page.getByText('Stop',{exact:true}).click();
 await expect(legacy.locator('filter')).toHaveCount(0);
});
