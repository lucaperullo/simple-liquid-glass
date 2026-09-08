import { build } from 'vite';
await build({configFile:false,publicDir:false,build:{outDir:'/private/tmp/liquid-glass-safari-preview',emptyOutDir:true,sourcemap:false,rollupOptions:{input:['tests/browser/safari.html','tests/browser/optics.html']}}});
