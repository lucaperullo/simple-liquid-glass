import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import LiquidGlass, { LiquidGlassHandle } from './index';

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
    mode: {
      control: 'radio',
      options: ['preset', 'custom'],
    },
    quality: {
      control: 'radio',
      options: ['low', 'standard', 'high', 'extreme'],
    },
    autodetectquality: { control: 'boolean' },
    mobileFallback: {
      control: 'radio',
      options: ['css-only', 'svg'],
    },
    effectMode: {
      control: 'radio',
      options: ['auto', 'svg', 'blur', 'webgl', 'off'],
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
    quality: 'low',
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
  ),
  parameters: {
    backgrounds: {
      // use controls in the toolbar to test on different backgrounds
    },
  },
};


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
  render: (args) => (
    <DraggableWrapper width={480} height={280}>
      <LiquidGlass {...args} />
    </DraggableWrapper>
  ),
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

/**
 * WebGL refraction (works on iOS Safari & Firefox).
 * The page is snapshotted with html2canvas (auto-loaded from CDN), so the
 * story provides its own DOM background to refract. Use "Re-snapshot" after
 * changing what's behind the glass.
 */
function WebGLShowcase(args: React.ComponentProps<typeof LiquidGlass>) {
  const glassRef = useRef<LiquidGlassHandle>(null);
  const [hue, setHue] = useState(200);

  return (
    <div style={{ position: 'relative', width: 720, maxWidth: '90vw', padding: 24 }}>
      {/* background content that gets refracted */}
      <div style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ height: 70, background: `linear-gradient(90deg, hsl(${hue} 90% 60%), hsl(${hue + 80} 90% 60%), hsl(${hue + 160} 90% 60%))` }} />
        <div style={{ display: 'flex', height: 70 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ flex: 1, background: i % 2 ? '#222' : '#fff' }} />
          ))}
        </div>
        <div style={{ height: 70, background: `radial-gradient(circle at 30% 50%, hsl(${hue + 240} 90% 65%), #130f40)` }} />
      </div>

      {/* glass pane on top */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 340, height: 150 }}>
        <LiquidGlass ref={glassRef} {...args}>
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>
            WebGL refraction
          </div>
        </LiquidGlass>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 12 }} data-liquid-ignore="">
        <button onClick={() => setHue((h) => (h + 40) % 360)}>Shift background colors</button>
        <button onClick={() => glassRef.current?.refresh()}>Re-snapshot (ref API)</button>
      </div>
    </div>
  );
}

export const WebGLRefraction: Story = {
  args: {
    effectMode: 'webgl',
    aberrationIntensity: 1,
    blur: 2,
  },
  render: (args) => <WebGLShowcase {...args} />,
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

