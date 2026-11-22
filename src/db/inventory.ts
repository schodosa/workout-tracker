// Reads and writes for owned equipment, accessories and bands.
import { useLiveQuery } from 'dexie-react-hooks'
import { newId } from '../domain/ids.ts'
import type { Inventory } from '../domain/inventory.ts'
import type { BandRecord } from '../domain/records.ts'
import type { Accessory } from '../domain/types.ts'
import { db } from './db.ts'

/** Everything the user owns. `configured` is false until equipment has been saved once. */
export function useInventory(): Inventory | undefined {
  return useLiveQuery(async () => {
    const [owned, accessories, bands] = await Promise.all([db.settings.get('ownedEquipment'), db.settings.get('accessories'), db.bands.toArray()])
    return {
      configured: owned !== undefined,
      equipmentIds: (owned?.value as string[] | undefined) ?? [],
      accessories: (accessories?.value as Accessory[] | undefined) ?? [],
      bands,
    }
  })
}

/** Saves the whole owned-equipment list (this is also what marks the inventory as set up). */
export async function setOwnedEquipment(ids: string[]): Promise<void> {
  await db.settings.put({ key: 'ownedEquipment', value: ids })
}

export async function setAccessories(items: Accessory[]): Promise<void> {
  await db.settings.put({ key: 'accessories', value: items })
}

export async function addBand(band: Omit<BandRecord, 'id' | 'createdAt'>): Promise<string> {
  const id = newId()
  await db.bands.add({ ...band, id, createdAt: Date.now() })
  return id
}

export async function updateBand(id: string, changes: Partial<Omit<BandRecord, 'id' | 'createdAt'>>): Promise<void> {
  await db.bands.update(id, changes)
}

/** True if any logged set used this band (so deleting it would leave a gap in history). */
export async function isBandUsed(id: string): Promise<boolean> {
  return (await db.sets.filter((s) => s.bandIds?.includes(id) ?? false).count()) > 0
}

export async function deleteBand(id: string): Promise<void> {
  await db.bands.delete(id)
}

/**
 * A function turning band ids into labels, for showing logged sets. Includes retired bands, so
 * history keeps their names; a deleted band shows as "removed band".
 */
export function useBandLabeler(): (id: string) => string {
  const bands = useLiveQuery(() => db.bands.toArray()) ?? []
  const byId = new Map(bands.map((b) => [b.id, b.label]))
  return (id) => byId.get(id) ?? 'removed band'
}
