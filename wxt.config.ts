// wxt.config.ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'ThreadPin',
    description: 'Bookmark your reading position in AI chat conversations',
    version: '0.1.0',
    permissions: ['storage'],
    host_permissions: [
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
      'https://claude.ai/*',
    ],
  },
});
