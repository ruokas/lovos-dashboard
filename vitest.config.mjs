import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@supabase/supabase-js': resolve(__dirname, 'tests/__mocks__/supabase-js.js'),
    },
  },
});
