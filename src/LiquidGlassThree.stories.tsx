import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { LiquidGlassThree } from './index';

type C = typeof LiquidGlassThree;

const meta: Meta<C> = {
  title: 'LiquidGlass/WebGL Three',
  component: LiquidGlassThree,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#111111' },
        { name: 'gray', value: '#2b2b2b' },
      ],
    },
  },
  args: {
    width: 480,
    height: 480,
    trackMouse: true,
    mouseMomentum: 0.12,
    backgroundColor: '#d0d0d0',
    imageSrc:
      'https://firebasestorage.googleapis.com/v0/b/unicorn-studio.appspot.com/o/Zz28X5RDkvcGGVYLr9X6QdTIhxy1%2FTulips%20in%20dreamy%20light%20blue%20sky.png?alt=media&token=ac293af7-9939-45e6-afa1-0c9b2028e096',
    darkenAmount: 0.2,
    darkenRadius: 0.248,
    darkenPos: { x: 0.5, y: 0.282 },
    lightenAmount: 0.35,
    lightenRadius: 0.208,
    lightenPos: { x: 0.5, y: 0.37 },
    lightenColor: '#d0d0d0',
    lensEnabled: true,
    lensRadius: 0.492,
    lensDispersion: 0.01,
  },
};

export default meta;

type Story = StoryObj<C>;

export const Default: Story = {
  render: (args) => (
    <div style={{ width: args.width, height: args.height }}>
      <LiquidGlassThree {...args} />
    </div>
  ),
};

