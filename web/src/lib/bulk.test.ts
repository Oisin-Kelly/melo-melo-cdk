import { sileo } from 'sileo'
import { describe, expect, it } from 'vitest'
import { forEachId, reportBulk } from './bulk'

describe('forEachId', () => {
  it('runs a few at a time and sorts the ids into done and failed', async () => {
    let running = 0
    let most = 0
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const result = await forEachId(ids, async (id) => {
      most = Math.max(most, ++running)
      await new Promise((resolve) => setTimeout(resolve, 1))
      running--
      if (id === 'c') throw new Error('no')
    })
    expect(most).toBe(4)
    expect(result.done.sort()).toEqual(['a', 'b', 'd', 'e', 'f', 'g'])
    expect(result.failed).toEqual(['c'])
  })

  it('does nothing for no ids', async () => {
    expect(await forEachId([], async () => {})).toEqual({ done: [], failed: [] })
  })
})

describe('reportBulk', () => {
  const words = { did: 'Deleted', couldnt: 'delete', noun: ['album', 'albums'] as const }

  it('says how many went through', () => {
    reportBulk({ done: ['a'], failed: [] }, words)
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Deleted 1 album', description: undefined })
  })

  it('says when some or all failed', () => {
    reportBulk({ done: ['a', 'b'], failed: ['c'] }, words)
    expect(sileo.error).toHaveBeenCalledWith({
      title: "Deleted 2 · 1 couldn't be deleted",
      description: 'The rest are still selected, to try again.',
    })
    reportBulk({ done: [], failed: ['c', 'd'] }, words)
    expect(sileo.error).toHaveBeenCalledWith({ title: "Couldn't delete 2 albums", description: 'Please try again.' })
  })
})
