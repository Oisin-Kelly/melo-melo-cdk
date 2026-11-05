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
