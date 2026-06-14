import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import LiquidGlass, { type LiquidGlassHandle } from './index';

type LiquidGlassComponent = typeof LiquidGlass;

const meta: Meta<LiquidGlassComponent> = {
  title: 'LiquidGlass/Draggable',
  component: LiquidGlass,
  parameters: {
    layout: 'centered',
    backgrounds: {
      options: {
        light: { name: 'light', value: '#ffffff' },
        dark: { name: 'dark', value: '#111111' },
        gray: { name: 'gray', value: '#2b2b2b' },
        brand: { name: 'brand', value: '#0ea5e9' },
        imageForest: {
          name: 'Image: Forest',
          value: 'url("https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=2400&auto=format&fit=crop") center / cover no-repeat fixed',
        },
        imageCity: {
          name: 'Image: City',
          value: 'url("https://images.unsplash.com/photo-1508057198894-247b23fe5ade?q=80&w=2400&auto=format&fit=crop") center / cover no-repeat fixed',
        },
        imageBeach: {
          name: 'Image: Beach',
          value: 'url("https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2400&auto=format&fit=crop") center / cover no-repeat fixed',
        },
      },
    },
  },
  argTypes: {
    mode: {
      control: 'radio',
      options: ['preset', 'custom'],
    },
    quality: {
      control: 'select',
      options: ['auto', 'low', 'standard', 'high', 'extreme'],
      mapping: { auto: undefined },
      description: 'Explicit quality tier. Choose "auto" (undefined) to let autodetectquality decide.',
    },
    autodetectquality: { control: 'boolean' },
    mobileFallback: {
      control: 'radio',
      options: ['css-only', 'svg'],
    },
    effectMode: {
      control: 'radio',
      options: ['auto', 'svg', 'blur', 'off'],
    },
    scale: { control: { type: 'range', min: 0, max: 400, step: 1 } },
    radius: { control: { type: 'range', min: 0, max: 200, step: 1 } },
    border: { control: { type: 'range', min: 0, max: 0.5, step: 0.01 } },
    lightness: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    displace: { control: { type: 'range', min: 0, max: 20, step: 0.1 } },
    alpha: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    blur: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    dispersion: { control: { type: 'range', min: 0, max: 200, step: 1 } },
    saturation: { control: { type: 'range', min: 0, max: 300, step: 1 } },
    aberrationIntensity: { control: { type: 'range', min: 0, max: 4, step: 0.1 } },
    frost: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    borderColor: { control: 'color' },
    glassColor: {
      control: 'color',
      description: 'Semi-transparent color for the glass background (must include alpha)'
    },
    background: { 
      control: 'text',
      description: 'Background color or gradient (will be made semi-transparent automatically)'
    },
    autoTextColor: { control: 'boolean' },
    textOnDark: { control: 'color' },
    textOnLight: { control: 'color' },
    forceTextColor: { control: 'boolean' },
  },
  args: {
    mode: 'preset',
    effectMode: 'auto',
    autodetectquality: false,
    radius: 50,
    scale: 160,
    dispersion: 50,
    saturation: 140,
    aberrationIntensity: 0,
    lightness: 53,
    alpha: 0.9,
    blur: 0,
    frost: 0.1,
    border: 0.05,
    borderColor: 'rgba(120, 120, 120, 0.7)',
    glassColor: 'rgba(255, 255, 255, 0.4)',
    background: undefined,
    autoTextColor: false,
    textOnDark: '#ffffff',
    textOnLight: '#111111',
    forceTextColor: false,
    iosMinBlur: 7,
    iosBlurMode: 'auto',
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
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [withTransition, setWithTransition] = useState(false);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (pointerIdRef.current === null) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    setOffset({ x: dx, y: dy });
  }, []);

  const endDrag = useCallback(() => {
    pointerIdRef.current = null;
    // Snap back to origin with a transition
    setWithTransition(true);
    setOffset({ x: 0, y: 0 });
    // Remove transition after it finishes to not affect subsequent drags
    const timeout = setTimeout(() => setWithTransition(false), 300);
    return () => clearTimeout(timeout);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!draggableRef.current) return;
    draggableRef.current.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    startRef.current = { x: e.clientX, y: e.clientY };
    setWithTransition(false);
  }, []);

  useEffect(() => {
    const handlePointerUp = (e: PointerEvent) => {
      if (pointerIdRef.current === null) return;
      endDrag();
    };
    const handlePointerCancel = (e: PointerEvent) => {
      if (pointerIdRef.current === null) return;
      endDrag();
    };
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [endDrag]);

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [onPointerMove]);

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
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          transition: withTransition ? 'transform 300ms cubic-bezier(0.2, 0, 0, 1)' : 'none',
          cursor: 'grab',
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
    <DraggableWrapper width={480} height={280}>
      <LiquidGlass {...args} />
    </DraggableWrapper>
  )
};


function AutodetectDemo(args: any) {
  const ref = useRef<LiquidGlassHandle>(null);
  const [tier, setTier] = useState<string>('detecting…');
  useEffect(() => {
    const read = () => {
      const q = ref.current?.getQuality?.();
      if (q) setTier(q);
    };
    read();
    const id = setInterval(read, 200);
    const stop = setTimeout(() => clearInterval(id), 5000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <div
        style={{
          fontSize: 13,
          fontFamily: 'monospace',
          padding: '4px 12px',
          borderRadius: 8,
          border: '1px solid rgba(127,127,127,0.35)',
        }}
      >
        auto-detected quality: <strong>{tier}</strong>
      </div>
      <DraggableWrapper width={480} height={280}>
        <LiquidGlass ref={ref} {...args} />
      </DraggableWrapper>
    </div>
  );
}

export const AutodetectQuality: Story = {
  args: {
    autodetectquality: true,
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
        Autodetect Quality
      </div>
    ),
  },
  render: (args) => <AutodetectDemo {...args} />,
};

export const ExtremeQuality: Story = {
  args: {
    quality: 'extreme',
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
        Extreme Quality
      </div>
    ),
  },
  render: (args) => (
    <DraggableWrapper width={480} height={280}>
      <LiquidGlass {...args} />
    </DraggableWrapper>
  ),
};

export const BlurOnly: Story = {
  args: {
    effectMode: 'blur',
    blur: 2,
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
        CSS Blur Only
      </div>
    ),
  },
  render: (args) => (
    <DraggableWrapper width={480} height={280}>
      <LiquidGlass {...args} />
    </DraggableWrapper>
  ),
};

export const EffectOff: Story = {
  args: {
    effectMode: 'off',
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
        Effect Off
      </div>
    ),
  },
  render: (args) => (
    <DraggableWrapper width={480} height={280}>
      <LiquidGlass {...args} />
    </DraggableWrapper>
  ),
};

export const MobileCSSOnly: Story = {
  args: {
    mobileFallback: 'css-only',
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
        Force CSS-only
      </div>
    ),
  },
  render: (args) => (
    <DraggableWrapper width={480} height={280}>
      <LiquidGlass {...args} />
    </DraggableWrapper>
  ),
};

