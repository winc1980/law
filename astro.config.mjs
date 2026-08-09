// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

// GitHub Pages のプロジェクトサイトとして https://winc1980.github.io/law/ に公開する。
// 独自ドメインへ移す場合は site を差し替え、base を '/' にする。
export default defineConfig({
  site: 'https://winc1980.github.io',
  base: '/law',
  trailingSlash: 'always',

  build: {
    format: 'directory',
  },

  integrations: [react()],
});