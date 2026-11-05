import type { CSSProperties } from 'react'

/** A cover's dominant colour as --mm-tint, for the tinted washes (.mm-row, captions). */
export const tint = (colour: string | null | undefined) =>
  colour ? ({ '--mm-tint': colour } as CSSProperties) : undefined
