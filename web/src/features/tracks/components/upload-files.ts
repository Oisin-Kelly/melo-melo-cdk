import { LIMITS } from '@/config/limits'
import { MAX_AUDIO_BYTES } from '@/lib/dropbox'

const AUDIO_EXTENSIONS = ['wav', 'flac', 'aiff', 'aif', 'm4a', 'mp3', 'ogg', 'opus', 'aac', 'alac', 'wma', 'webm']

/** Why a picked file won't upload (too big, not audio), or null. The server has the last
 *  word on whether it's audio — this only catches the obvious before a long upload. */
export function audioFileError(file: File): string | null {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
  const looksLikeAudio = file.type.startsWith('audio/') || AUDIO_EXTENSIONS.includes(ext)
  if (!looksLikeAudio) return "That doesn't look like an audio file. Choose a WAV, FLAC, MP3 or similar."
  if (file.size > MAX_AUDIO_BYTES) return 'That file is over 300 MB. Choose a smaller one.'
  if (file.size === 0) return 'That file is empty.'
  return null
}

/** A track name from a file name: "late_shift-v2.wav" → "late shift v2" (within the limit) */
export function nameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '')
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.name)
}
