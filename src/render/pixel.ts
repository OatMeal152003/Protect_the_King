export interface PixelSettings {
  width: number;
  height: number;
  posterize: boolean;
  outline: boolean;
}

const DEFAULTS: PixelSettings = { width: 640, height: 360, posterize: false, outline: false };

export function loadSettings(): PixelSettings {
  try {
    const raw = localStorage.getItem('ptk_settings');
    if (raw) {
      const parsed = { ...DEFAULTS, ...JSON.parse(raw) };
      if (parsed.width < 480) parsed.width = 640;
      if (parsed.height < 270) parsed.height = 360;
      return parsed;
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveSettings(s: PixelSettings): void {
  localStorage.setItem('ptk_settings', JSON.stringify(s));
}