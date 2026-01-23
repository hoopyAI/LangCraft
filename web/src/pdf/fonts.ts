import { Font } from '@react-pdf/renderer';

let fontsRegistered = false;
let fontsLoaded: Promise<void> | null = null;

type PdfFontConfig = {
  family: string;
  sources: Array<{ label: string; url: string; fontWeight: number; fontStyle: 'normal' | 'italic' }>;
};

const getPdfFontConfig = (): PdfFontConfig => {
  // React-PDF fetches font assets itself. In the browser build, using a relative URL
  // can fail depending on how the renderer resolves it. Use an absolute URL.
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Prefer TTF (sfnt) fonts for stability. WOFF2 frequently fails to parse in
  // react-pdf/fontkit, even if the URL fetch succeeds.
  return {
    family: 'NotoSansSC',
    sources: [
      // Stable TTF sources (preferred)
      { label: 'regular ttf', url: `${baseUrl}/fonts/NotoSansSC-Regular.ttf`, fontWeight: 400, fontStyle: 'normal' },
      { label: 'bold ttf', url: `${baseUrl}/fonts/NotoSansSC-Bold.ttf`, fontWeight: 700, fontStyle: 'normal' },

      // Some parts of the PDF use italic. If you don't have an italic face available,
      // falling back to Regular is better than throwing during resolution.
      { label: 'italic fallback ttf', url: `${baseUrl}/fonts/NotoSansSC-Regular.ttf`, fontWeight: 400, fontStyle: 'italic' },
    ],
  };
};

const probeUrl = async (label: string, url: string) => {
  if (typeof window === 'undefined') return;
  try {
    const res = await fetch(url);
    console.log(`[PDF Fonts] ${label} fetch:`, res.status, url);
  } catch (err) {
    console.warn(`[PDF Fonts] ${label} fetch failed:`, url, err);
  }
};

export const ensurePdfFonts = async () => {
  if (fontsLoaded) {
    return fontsLoaded;
  }

  fontsLoaded = (async () => {
    if (fontsRegistered) {
      return;
    }

    const cfg = getPdfFontConfig();

    console.log('[PDF Fonts] Registering PDF fonts...', cfg);

  await Promise.all(cfg.sources.map((source) => probeUrl(source.label, source.url)));

    // Register all sources. If both TTF + WOFF2 are present, the renderer can pick
    // the first successfully parsed face for each weight.
    const fonts = cfg.sources.map((source) => ({
      src: source.url,
      fontWeight: source.fontWeight,
      fontStyle: source.fontStyle,
    }));

    Font.register({
      family: cfg.family,
      fonts,
    });

    // NOTE: Some older examples mention Font.load(), but it isn't part of the public
    // @react-pdf/renderer API typings in this version. We rely on registration +
    // renderer-time loading. If this still throws "Could not resolve font...",
    // it's typically a font parsing issue (WOFF2) and switching to TTF/OTF fixes it.

    Font.registerHyphenationCallback((word: string) => [word]);

    fontsRegistered = true;
    console.log('[PDF Fonts] Font registration + load complete');
  })();

  return fontsLoaded;
};

export default ensurePdfFonts;
