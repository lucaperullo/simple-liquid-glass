/** @jest-environment node */
describe('next: server rendering', () => {
  it('imports with no DOM, and a host made there does nothing and does not throw', async () => {
    expect(typeof window).toBe('undefined');
    const next = await import('../next');
    expect(next.supportsWorkerCanvas()).toBe(false);

    const host = next.createGlassHost();
    expect(host.thread).toBe('pending');
    await expect(host.ready).resolves.toBe('page');
    await expect(host.stats()).resolves.toMatchObject({ frames: 0, fps: 0, scrollError: 0, thread: 'page' });
    host.destroy();
  });
});
