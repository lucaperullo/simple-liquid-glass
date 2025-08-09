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
  },
};

export default meta;

type Story = StoryObj<Cmp>;

export const Basic: Story = {
  render: (args) => (
    <LiquidGlassCanvas {...args}
      backdropSource={document.querySelector('canvas.backdrop-source') as HTMLCanvasElement | null ?? undefined}
    >
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontWeight: 600 }}>
        Canvas Glass
      </div>
    </LiquidGlassCanvas>
  ),
};


