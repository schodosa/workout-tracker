import { builtinCatalog } from '../../domain/builtins.ts'
import type { Template } from '../../domain/types.ts'

/** "Bowflex Xtreme 2 SE, Floor / bodyweight", or "Adapts to your equipment" for pattern-based templates. */
export function equipmentLine(t: Template): string {
  if (t.items.some((i) => i.pattern)) return 'Adapts to your equipment'
  return t.requiredEquipmentIds.map((id) => builtinCatalog.equipment.get(id)?.name ?? id).join(', ')
}
