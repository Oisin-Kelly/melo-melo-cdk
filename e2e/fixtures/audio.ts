import * as fs from 'fs';
import * as path from 'path';

// Upload tests need a real audio file. Drop one into e2e/fixtures/assets/
// named `sample.<ext>` — e.g. sample.mp3 or sample.wav. Any extension listed
// in CONTENT_TYPES works. Tests skip with a clear message if it's missing.
const ASSETS_DIR = path.join(__dirname, 'assets');

const CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
};

export interface AudioFixture {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

export function findAudioFixture(): AudioFixture | null {
  if (!fs.existsSync(ASSETS_DIR)) return null;

  const file = fs
    .readdirSync(ASSETS_DIR)
    .find((f) => path.parse(f).name === 'sample' && path.extname(f).toLowerCase() in CONTENT_TYPES);

  if (!file) return null;

  const extension = path.extname(file).toLowerCase();
  return {
    buffer: fs.readFileSync(path.join(ASSETS_DIR, file)),
    contentType: CONTENT_TYPES[extension],
    extension,
  };
}
