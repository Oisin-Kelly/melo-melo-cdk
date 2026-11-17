import { describe, expect, it } from 'vitest'
import { audioFileError, nameFromFile } from './upload-files'

const file = (name: string, type: string, size = 1024) => new File([new Uint8Array(size)], name, { type })

describe('nameFromFile', () => {
  it.each([
    ['late_shift-v2.wav', 'late shift v2'],
    ['Demo   take 3.final.flac', 'Demo take 3.final'],
    ['no-extension', 'no extension'],
  ])('%j → %j', (input, expected) => {
    expect(nameFromFile(input)).toBe(expected)
  })
})

describe('audioFileError', () => {
  it('takes audio by type, or by extension when the browser gives no type', () => {
    expect(audioFileError(file('a.mp3', 'audio/mpeg'))).toBeNull()
    expect(audioFileError(file('a.flac', ''))).toBeNull()
  })

  it('refuses what clearly is not audio, or is empty', () => {
    expect(audioFileError(file('photo.jpg', 'image/jpeg'))).toMatch(/doesn't look like an audio file/)
    expect(audioFileError(file('a.wav', 'audio/wav', 0))).toBe('That file is empty.')
  })

  it('refuses files over 300 MB before uploading', () => {
    const big = file('a.wav', 'audio/wav')
    Object.defineProperty(big, 'size', { value: 301 * 1024 * 1024 })
    expect(audioFileError(big)).toMatch(/over 300 MB/)
  })
})
