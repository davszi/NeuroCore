import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface AppSettings {
  remotePath: string;
  host?: string;
  user?: string;
}

export function saveSettings(settings: AppSettings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    console.log(`[Settings] Saved to ${SETTINGS_FILE}`);
  } catch (e) {
    console.error("[Settings] Failed to save:", e);
  }
}

export function getSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("[Settings] Failed to load:", e);
  }
  // Default fallback if file doesn't exist
  return { remotePath: '/scratch/neurocore-app' };
}