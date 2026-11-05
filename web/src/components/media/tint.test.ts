import { describe, expect, it } from 'vitest'
import { tint } from './tint'

describe('tint', () => {
  it("sets the cover's colour as --mm-tint", () => {
    expect(tint('#30b0c7')).toEqual({ '--mm-tint': '#30b0c7' })
  })

  it.each([null, undefined, ''])('is undefined without a colour (%j)', (colour) => {
    expect(tint(colour)).toBeUndefined()
  })
})
