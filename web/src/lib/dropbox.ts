import { api } from '@/lib/api-client'

// Staging uploads (GET /buckets/dropbox): the server presigns a PUT under your own
// prefix and returns the staged key, which is what you send back as imageKey/audioKey.
// The PUT goes straight to S3 — no auth header, the signature is the credential.

/** Image types the server's ImageSharp pipeline reads. Listing them (rather than
 *  image/*) also makes iOS convert HEIC photos to JPEG on pick. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'
/** Matches ImageService's 20MB cap, so oversized picks fail before uploading. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export async function stageUpload(file: File, folder: string): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'bin'
  const { url, key } = await api<{ url: string; key: string }>(
    `/buckets/dropbox?key=${encodeURIComponent(`${folder}/${crypto.randomUUID()}.${ext}`)}`,
  )
  const response = await fetch(url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  })
  if (!response.ok) throw new Error(`Upload failed (${response.status})`)
  return key
}

/** Why a picked cover image won't do (the server's types and 20MB cap), or null. */
export function imageFileError(file: File): string | null {
  if (!IMAGE_ACCEPT.split(',').includes(file.type)) return 'Choose a JPEG, PNG, WebP or GIF image.'
  if (file.size > MAX_IMAGE_BYTES) return 'That image is over 20 MB. Choose a smaller one.'
  return null
}

/** Audio the upload takes: any audio type, plus the extensions some pickers (iOS Files)
 *  only offer by name. The server reads the file itself, so this only guides the picker. */
export const AUDIO_ACCEPT = 'audio/*,.wav,.flac,.aiff,.aif,.m4a,.mp3,.ogg,.opus'
/** Matches the upload's 300MB cap (ValidateUploadedAudioAsync), checked before uploading. */
export const MAX_AUDIO_BYTES = 300 * 1024 * 1024

/** Like stageUpload, reporting progress (0–1) as the file goes up — fetch can't, so this
 *  is an XMLHttpRequest — and stoppable with `signal`. Resolves with the staged key. */
export async function stageUploadWithProgress(
  file: File,
  folder: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'bin'
  const { url, key } = await api<{ url: string; key: string }>(
    `/buckets/dropbox?key=${encodeURIComponent(`${folder}/${crypto.randomUUID()}.${ext}`)}`,
    { signal },
  )
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)))
    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(file)
  })
  onProgress(1)
  return key
}
