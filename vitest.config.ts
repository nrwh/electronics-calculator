import { defineConfig } from 'vitest/config';
import { kicadPlugin } from './build/kicad-plugin';

export default defineConfig({
  plugins: [kicadPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'build/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
