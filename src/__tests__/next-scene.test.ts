import {
  createShapeBatch,
  readShape,
  transferables,
  writeShape,
  type HostMessage,
  type ShapeBox,
} from '../next/scene';

const boxes: ShapeBox[] = [
  { x: 16, y: 16, width: 296, height: 90.5, radius: 22 },
  { x: 81.25, y: 120.5, width: 165.5, height: 90.5, radius: 12 },
];

describe('next: scene protocol', () => {
  it('carries shapes across a thread boundary as typed arrays', () => {
    const batch = createShapeBatch(boxes.length);
    writeShape(batch, 0, 7, boxes[0]!, { stiffness: 170, damping: 18 });
    writeShape(batch, 1, 9, boxes[1]!, null);
    const message: HostMessage = { type: 'shapes-set', layer: 3, batch };

    // What postMessage does: a structured clone that moves the listed buffers.
    const received = structuredClone(message, { transfer: transferables(message) });

    expect(received.type).toBe('shapes-set');
    if (received.type !== 'shapes-set') return;
    expect(received.layer).toBe(3);
    // (Named by tag: the clone's arrays come from another realm under Jest.)
    expect(Object.prototype.toString.call(received.batch.ids)).toBe('[object Uint32Array]');
    expect(Object.prototype.toString.call(received.batch.values)).toBe('[object Float32Array]');
    expect(readShape(received.batch, 0)).toEqual({
      id: 7,
      box: boxes[0],
      spring: { stiffness: 170, damping: 18 },
    });
    expect(readShape(received.batch, 1)).toEqual({ id: 9, box: boxes[1], spring: null });
    // Moved, not copied: the sender's buffers are empty now.
    expect(batch.values.byteLength).toBe(0);
    expect(batch.ids.byteLength).toBe(0);
    expect(batch.springs.byteLength).toBe(0);
  });

  it('moves nothing for messages that carry only numbers', () => {
    expect(transferables({ type: 'settle' })).toEqual([]);
    expect(transferables({ type: 'stats', request: 1 })).toEqual([]);
    expect(
      transferables({
        type: 'layer-view',
        layer: 1,
        view: { left: 0, top: 0, width: 1, height: 1 },
        scale: 2,
      }),
    ).toEqual([]);
  });

  it('moves the ids of removed shapes', () => {
    const ids = Uint32Array.of(4, 5);
    expect(transferables({ type: 'shapes-remove', layer: 1, ids })).toEqual([ids.buffer]);
  });
});
