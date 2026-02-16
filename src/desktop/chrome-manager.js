const { findChrome } = require('../core/chrome-finder');

async function ensureChrome(cachePath, mainWindow) {
  const existing = findChrome(cachePath);
  if (existing) {
    console.log(`[Chrome] Found: ${existing}`);
    return existing;
  }

  console.log('[Chrome] Not found, downloading Chrome for Testing...');
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(
      `document.title = 'Chrome 다운로드 중... (최초 1회)'`
    ).catch(() => {});
  }

  try {
    const { install, Browser, detectBrowserPlatform, resolveBuildId } = require('@puppeteer/browsers');
    const platform = detectBrowserPlatform();
    const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');

    const result = await install({
      browser: Browser.CHROME,
      buildId,
      cacheDir: cachePath,
      downloadProgressCallback: (downloadedBytes, totalBytes) => {
        if (mainWindow && totalBytes > 0) {
          const pct = Math.round((downloadedBytes / totalBytes) * 100);
          mainWindow.setProgressBar(pct / 100);
          mainWindow.webContents.executeJavaScript(
            `document.title = 'Chrome 다운로드 중... ${pct}%'`
          ).catch(() => {});
        }
      },
    });

    if (mainWindow) {
      mainWindow.setProgressBar(-1);
      mainWindow.webContents.executeJavaScript(
        `document.title = 'WebImageClaw'`
      ).catch(() => {});
    }

    console.log(`[Chrome] Downloaded: ${result.executablePath}`);
    return result.executablePath;
  } catch (err) {
    console.error('[Chrome] Download failed:', err.message);
    const fallback = findChrome();
    if (fallback) {
      console.log(`[Chrome] Fallback to system Chrome: ${fallback}`);
      return fallback;
    }
    throw new Error('Chrome을 찾을 수 없습니다. Chrome 브라우저를 설치해주세요.');
  }
}

module.exports = { ensureChrome };
