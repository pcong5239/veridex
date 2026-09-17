import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom)[\\/]/ },
            { name: 'genlayer-core', test: /node_modules[\\/]genlayer-js[\\/]dist[\\/]chunk-DQFRJO5T\.js$/ },
            { name: 'genlayer', test: /node_modules[\\/]genlayer-js[\\/]/ },
            { name: 'web3', test: /node_modules[\\/](viem|ox|@noble)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
  },
});
