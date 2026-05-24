export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  async main() {
    console.log('[ThreadPin] loaded');
  },
});
