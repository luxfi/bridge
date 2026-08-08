import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.cjs.js',
      format: 'cjs',
    },
    {
      file: 'dist/index.esm.js',
      format: 'esm',
    },
  ],
  // outDir has to be named. No tsconfig in the chain sets one, so the plugin
  // defaults it to the tsconfig's own directory — pkg/utila — and then refuses
  // it, because it validates that outDir sits inside the directory each Rollup
  // `file` writes to:
  //   Path of Typescript compiler option 'outDir' must be located inside the
  //   same directory as the Rollup 'file' option.
  // Both outputs go to dist/, so one value satisfies both. Without it the build
  // simply does not run — which is why dist/ here is older than the sources it
  // is built from, and why the server image could not be rebuilt.
  plugins: [typescript({ outDir: 'dist' }), resolve(), commonjs()],
};
