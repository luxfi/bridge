import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'test/index.ts', // Update with your test entry point
  output: {
    file: 'dist/test/index.js',
    format: 'es',
  },
  plugins: [typescript(), resolve(), commonjs()],
};
