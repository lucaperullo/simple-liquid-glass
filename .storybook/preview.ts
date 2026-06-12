import type { Preview } from '@storybook/react-vite';

const preview: Preview = {
  parameters: {
    backgrounds: {
      options: {
        light: { name: 'light', value: '#f5f5f5' },
        dark: { name: 'dark', value: '#1f1f1f' },
        checkerboard: { name: 'checkerboard', value: 'repeating-conic-gradient(#e0e0e0 0% 25%, #ffffff 0% 50%) 50% / 16px 16px' },
        blue: { name: 'blue', value: '#0e7490' },
        gradient: { name: 'gradient', value: 'linear-gradient(135deg, #111827 0%, #0ea5e9 100%)' },

        // Photo backgrounds (remote). These use full CSS background shorthand
        // so Storybook applies them as images.
        mountains: { name: 'mountains', value: 'url("https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1920&q=80") center / cover no-repeat fixed' },
        city_night: { name: 'city night', value: 'url("https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1920&q=80") center / cover no-repeat fixed' },
        ocean: { name: 'ocean', value: 'url("https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80") center / cover no-repeat fixed' },
        forest: { name: 'forest', value: 'url("https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1920&q=80") center / cover no-repeat fixed' },
        abstract: { name: 'abstract', value: 'url("https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1920&q=80") center / cover no-repeat fixed' }
      }
    },
    layout: 'centered',
    controls: { expanded: true },
  },

  initialGlobals: {
    backgrounds: {
      value: 'light'
    }
  },

  tags: ['autodocs']
};

export default preview;


