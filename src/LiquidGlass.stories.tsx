import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import LiquidGlass, { WebGLLiquidGlass } from './index';

type LiquidGlassComponent = typeof LiquidGlass;

const meta: Meta<LiquidGlassComponent> = {
  title: 'LiquidGlass/Draggable',
  component: LiquidGlass,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#111111' },
        { name: 'gray', value: '#2b2b2b' },
        { name: 'brand', value: '#0ea5e9' },
        {
          name: 'Image: Forest',
          value: 'url("https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=2400&auto=format&fit=crop") center / cover no-repeat fixed',
        },
        {
          name: 'Image: City',
          value: 'url("https://images.unsplash.com/photo-1508057198894-247b23fe5ade?q=80&w=2400&auto=format&fit=crop") center / cover no-repeat fixed',
        },
        {
          name: 'Image: Beach',
          value: 'url("https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2400&auto=format&fit=crop") center / cover no-repeat fixed',
        },
      ],
    },
  },
  argTypes: {
    intensity: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    blurRadius: { control: { type: 'range', min: 0, max: 50, step: 1 } },
    tint: { control: 'color' },
    borderRadius: { control: 'text' },
    reflectivity: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    roughness: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    refractiveIndex: { control: { type: 'range', min: 1, max: 2, step: 0.01 } },
    animation: { control: 'boolean' },
    animationSpeed: { control: { type: 'range', min: 0, max: 3, step: 0.1 } },
    displacementSource: { control: 'radio', options: ['procedural', 'texture'] },
    caustics: { control: 'boolean' },
    quality: { control: 'radio', options: ['low', 'med', 'high', 'ultra'] },
    backgroundSampling: { control: 'radio', options: ['screenCopy', 'html2canvas'] },
  },
  args: {
    intensity: 0.6,
    blurRadius: 18,
    tint: 'rgba(255,255,255,0.12)',
    borderRadius: '16px',
    reflectivity: 0.35,
    roughness: 0.25,
    refractiveIndex: 1.45,
    animation: true,
    animationSpeed: 0.6,
    displacementSource: 'procedural',
    caustics: true,
    quality: 'high',
    backgroundSampling: 'screenCopy',
  },
};

export default meta;

type Story = StoryObj<LiquidGlassComponent>;

function DraggableWrapper({
  width = 400,
  height = 240,
  children,
}: {
  width?: number;
  height?: number;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggableRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pendingRef = useRef<boolean>(false);
  const currentOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const applyTransform = useCallback(() => {
    pendingRef.current = false;
    const el = draggableRef.current;
    if (!el) return;
    const { x, y } = currentOffsetRef.current;
    el.style.transform = `translate(${x}px, ${y}px)`;
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (pointerIdRef.current === null) return;
    currentOffsetRef.current = { x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y };
    if (!pendingRef.current) {
      pendingRef.current = true;
      requestAnimationFrame(applyTransform);
    }
  }, [applyTransform]);

  const endDrag = useCallback(() => {
    pointerIdRef.current = null;
    const el = draggableRef.current;
    if (!el) return;
    el.style.transition = 'transform 300ms cubic-bezier(0.2, 0, 0, 1)';
    currentOffsetRef.current = { x: 0, y: 0 };
    requestAnimationFrame(applyTransform);
    const timeout = setTimeout(() => {
      if (!el) return;
      el.style.transition = 'none';
    }, 320);
    return () => clearTimeout(timeout);
  }, [applyTransform]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!draggableRef.current) return;
    draggableRef.current.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    startRef.current = { x: e.clientX, y: e.clientY };
    draggableRef.current.style.transition = 'none';
  }, []);

  useEffect(() => {
    const up = (e: PointerEvent) => { if (pointerIdRef.current !== null) endDrag(); };
    const cancel = (e: PointerEvent) => { if (pointerIdRef.current !== null) endDrag(); };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('pointermove', onPointerMove as any);
    };
  }, [endDrag, onPointerMove]);

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        position: 'relative',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <div
        ref={draggableRef}
        onPointerDown={onPointerDown}
        style={{
          position: 'absolute',
          inset: 0,
          transform: 'translate(0px, 0px)',
          transition: 'none',
          cursor: 'grab',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export const Draggable: Story = {
  args: {
    children: (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 600,
        }}
      >
        Drag me
      </div>
    ),
  },
  render: (args) => (
    <DraggableWrapper width={520} height={360}>
      <LiquidGlass {...args} />
    </DraggableWrapper>
  ),
  parameters: {
    backgrounds: {
      // use controls in the toolbar to test on different backgrounds
    },
  },
};


export const WebGLDemo: Story = {
  name: 'WebGL/Unicorn Replica',
  args: {
    children: undefined,
  },
  render: () => (
    <div style={{ width: 512, height: 512 }}>
      <WebGLLiquidGlass imageSrc="https://firebasestorage.googleapis.com/v0/b/unicorn-studio.appspot.com/o/Zz28X5RDkvcGGVYLr9X6QdTIhxy1%2FTulips%20in%20dreamy%20light%20blue%20sky.png?alt=media&token=ac293af7-9939-45e6-afa1-0c9b2028e096" />
    </div>
  ),
  parameters: {
    backgrounds: {
      default: 'light',
    },
  },
};

