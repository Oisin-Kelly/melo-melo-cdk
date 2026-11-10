import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

type Drag = { from: number; to: number; dy: number; shift: number }

/** Drag-to-reorder for a vertical list, by a handle on each row (Astryx has no sortable
 *  list). Press the handle and drag: the row follows the finger, the others slide out of
 *  its way, and letting go calls `onMove(from, to)`. Arrow up/down on the focused handle
 *  moves it one place, for keyboards. Works for mouse and touch alike (pointer events,
 *  with the handle set to `touch-action: none` so a drag never scrolls the page or pulls
 *  the bottom sheet down). */
export function useDragReorder(onMove: (from: number, to: number) => void) {
  const rows = useRef<(HTMLElement | null)[]>([])
  const start = useRef<{ from: number; y: number; rects: DOMRect[]; shift: number } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  const targetFor = (from: number, dy: number, rects: DOMRect[]) => {
    const centre = rects[from].top + rects[from].height / 2 + dy
    let to = from
    for (let j = from + 1; j < rects.length; j++) if (centre > rects[j].top + rects[j].height / 2) to = j
    for (let j = from - 1; j >= 0; j--) if (centre < rects[j].top + rects[j].height / 2) to = j
    return to
  }

  const end = () => {
    start.current = null
    setDrag(null)
  }

  return {
    /** Put on each row's outer element. */
    rowRef: (index: number) => (el: HTMLElement | null) => {
      rows.current[index] = el
    },

    /** Where each row sits while a drag is on. */
    rowStyle(index: number): CSSProperties | undefined {
      if (!drag) return undefined
      if (index === drag.from)
        return { transform: `translateY(${drag.dy}px)`, position: 'relative', zIndex: 2 }
      const shift =
        drag.from < index && index <= drag.to ? -drag.shift : drag.to <= index && index < drag.from ? drag.shift : 0
      return { transform: `translateY(${shift}px)`, transition: 'transform 0.15s ease' }
    },

    isDragging: (index: number) => drag?.from === index,

    /** Spread onto each row's handle (a button). */
    handleProps: (index: number, count: number) => ({
      onPointerDown(event: PointerEvent<HTMLElement>) {
        // Keep the press from reaching the row (which would play it) or the sheet's swipe
        event.stopPropagation()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        // Focus goes with the row being dragged, as when moving it by keyboard (Safari
        // doesn't focus a pressed button by itself)
        event.currentTarget.focus({ preventScroll: true })
        const rects = rows.current.slice(0, count).map((el) => el?.getBoundingClientRect() ?? new DOMRect())
        // How far a row moves to make room: the dragged row's height plus the gap below it
        const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0
        start.current = { from: index, y: event.clientY, rects, shift: rects[index].height + gap }
        setDrag({ from: index, to: index, dy: 0, shift: start.current.shift })
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const s = start.current
        if (!s) return
        const dy = event.clientY - s.y
        setDrag({ from: s.from, to: targetFor(s.from, dy, s.rects), dy, shift: s.shift })
      },
      onPointerUp() {
        if (drag && drag.to !== drag.from) onMove(drag.from, drag.to)
        end()
      },
      onPointerCancel: end,
      onClick(event: { stopPropagation: () => void }) {
        event.stopPropagation()
      },
      onKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (event.key === 'ArrowUp' && index > 0) {
          event.preventDefault()
          onMove(index, index - 1)
        } else if (event.key === 'ArrowDown' && index < count - 1) {
          event.preventDefault()
          onMove(index, index + 1)
        }
      },
    }),
  }
}
