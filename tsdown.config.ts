import { defineConfig } from 'tsdown'

const CLIENT_EXTERNAL = [
  '@deepseek-ai/dsh-client-ui-chat',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-slots',
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
]

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node22',
    dts: false,
    clean: true,
    outDir: 'lib',
    deps: {
      neverBundle: ['@deepseek-ai/cordis'],
    },
  },
  {
    entry: ['src/client/index.tsx'],
    format: ['cjs'],
    target: 'es2022',
    outDir: 'lib/client',
    deps: { neverBundle: CLIENT_EXTERNAL },
  },
])
