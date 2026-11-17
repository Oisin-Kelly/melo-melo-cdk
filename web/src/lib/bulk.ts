import { sileo } from 'sileo'

// Doing one thing to many items (the manage tables). The API has no bulk endpoints, so each
// is the single-item call per id. One failing doesn't stop the rest: the result says which
// went through and which didn't, so the screen can keep the failed ones selected for
// another go.

export type BulkResult = { done: string[]; failed: string[] }

const AT_ONCE = 4

/** Runs `request` for every id, a few at a time. */
export async function forEachId(ids: string[], request: (id: string) => Promise<unknown>): Promise<BulkResult> {
  const result: BulkResult = { done: [], failed: [] }
  let next = 0
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++]
      try {
        await request(id)
        result.done.push(id)
      } catch {
        result.failed.push(id)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, ids.length) }, worker))
  return result
}

/** Says how a bulk action went, once its dialog (if any) has closed: "Deleted 3 tracks",
 *  or "Deleted 2 · 1 couldn't be deleted". `noun` is [one, many]. */
export function reportBulk(
  result: BulkResult,
  { did, couldnt, noun, detail }: { did: string; couldnt: string; noun: readonly [string, string]; detail?: string },
) {
  const count = (n: number) => `${n} ${n === 1 ? noun[0] : noun[1]}`
  const { done, failed } = result
  if (failed.length === 0) sileo.success({ title: `${did} ${count(done.length)}`, description: detail })
  else if (done.length === 0) sileo.error({ title: `Couldn't ${couldnt} ${count(failed.length)}`, description: 'Please try again.' })
  else
    sileo.error({
      title: `${did} ${done.length} · ${failed.length} couldn't be ${couldnt === 'add' ? 'added' : `${couldnt}d`}`,
      description: 'The rest are still selected, to try again.',
    })
}
