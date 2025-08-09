import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { LiquidGlassCanvas } from './index';

type Cmp = typeof LiquidGlassCanvas;

const meta: Meta<Cmp> = {
  title: 'LiquidGlassCanvas/Basic',
  component: LiquidGlassCanvas,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#111111' },
        { name: 'gradient', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' as unknown as string },
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
    blur: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    radius: { control: { type: 'range', min: 0, max: 200, step: 1 } },
    border: { control: { type: 'range', min: 0, max: 0.5, step: 0.01 } },
    frost: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    borderColor: { control: 'color' },
    glassColor: { control: 'color' },
    autoTextColor: { control: 'boolean' },
    forceTextColor: { control: 'boolean' },
    quality: { control: { type: 'range', min: 0.5, max: 1, step: 0.05 } },
    debugPass: { control: 'select', options: ['source', 'blurH', 'blurV', 'composite'] },
  },
  args: {
    width: 480,
    height: 280,
    blur: 8,
    radius: 50,
    border: 0.05,
    frost: 0.15,
    borderColor: 'rgba(120,120,120,0.7)',
    glassColor: 'rgba(255,255,255,0.35)',
    autoTextColor: true,
    forceTextColor: true,
    quality: 1,
    debugPass: 'composite',
  },
};

export default meta;

type Story = StoryObj<Cmp>;

export const Basic: Story = {
  render: (args) => (
    <LiquidGlassCanvas
      {...args}
      getBackdrop={async () => {
        // Build a backdrop from the current Storybook background if it is an image URL
        const style = getComputedStyle(document.body);
        const bi = style.backgroundImage;
        const m = /url\(["']?([^"')]+)["']?\)/.exec(bi);
        if (m) {
          const url = m[1];
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = url;
          await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img load')); });
          const off = document.createElement('canvas');
          const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
          off.width = Math.floor((args.width ?? 480) * dpr);
          off.height = Math.floor((args.height ?? 280) * dpr);
          const ctx = off.getContext('2d')!;
          const iw = img.width, ih = img.height;
          const cw = off.width, ch = off.height;
          const ir = iw / ih, cr = cw / ch;
          let dw = cw, dh = ch, dx = 0, dy = 0;
          if (ir > cr) { dh = ch; dw = dh * ir; dx = (cw - dw) / 2; }
          else { dw = cw; dh = dw / ir; dy = (ch - dh) / 2; }
          ctx.drawImage(img, dx, dy, dw, dh);
          return off;
        }
        // fallback solid background
        const off = document.createElement('canvas');
        off.width = args.width ?? 480;
        off.height = args.height ?? 280;
        const ctx = off.getContext('2d')!;
        ctx.fillStyle = style.backgroundColor || '#666';
        ctx.fillRect(0, 0, off.width, off.height);
        return off;
      }}
    >
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontWeight: 600 }}>
        Canvas Glass
      </div>
    </LiquidGlassCanvas>
  ),
};


