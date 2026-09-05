/**
 * Settings > Sale Categories — working out what a "move up" actually writes.
 *
 * Swapping two neighbours' `sortOrder` is only correct while those values are
 * unique, and nothing guarantees that they are: a new category is stored with
 * `sortOrder ?? (count of rows)`, and delete really removes a row. From a fresh
 * install, deleting Upsell leaves Primary Sale at 0 and Other at 2 with a count
 * of 2, so adding "Renewals" hands it 2 as well. Swapping then writes 2 and 2 —
 * two writes hit the disk, the button is enabled, and the list never moves.
 *
 * So the move is expressed as "here is the order I want", and the order is
 * written back as a dense 0..n-1 sequence. Duplicate and sparse values heal
 * themselves the first time anything is moved, and the rows whose number is
 * already right are not written at all.
 */

export interface Sortable {
  id: string
  sortOrder: number
}

export interface SortOrderWrite {
  id: string
  sortOrder: number
}

/**
 * The writes that move `movingId` into `neighbourId`'s place.
 *
 * `ordered` must be the list AS DISPLAYED — the caller has already applied
 * whatever tie-break it shows rows in, and that displayed order is the thing
 * being made durable. Returns an empty array when either id is missing or the
 * resulting sequence is already what is stored.
 */
export function reorderWrites(
  ordered: readonly Sortable[],
  movingId: string,
  neighbourId: string,
): SortOrderWrite[] {
  if (movingId === neighbourId) return []

  const moving = ordered.find((c) => c.id === movingId)
  const neighbour = ordered.find((c) => c.id === neighbourId)
  if (!moving || !neighbour) return []

  const swapped = ordered.map((c) =>
    c.id === movingId ? neighbour : c.id === neighbourId ? moving : c,
  )

  const writes: SortOrderWrite[] = []
  swapped.forEach((c, position) => {
    if (c.sortOrder !== position) writes.push({ id: c.id, sortOrder: position })
  })
  return writes
}
