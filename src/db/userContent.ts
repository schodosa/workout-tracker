// Reads and writes for user-created exercises and templates.
import { newId } from '../domain/ids.ts'
import type { Exercise, Template } from '../domain/types.ts'
import { db } from './db.ts'

/** IDs carry a prefix so they can never collide with built-in IDs. */
export const newCustomExerciseId = () => `custom-${newId()}`
export const newUserTemplateId = () => `user-${newId()}`

export async function saveCustomExercise(ex: Exercise): Promise<void> {
  await db.customExercises.put({ ...ex, custom: true })
}

export async function saveUserTemplate(t: Template): Promise<void> {
  await db.userTemplates.put(t)
}

export interface ExerciseUsage {
  /** Names of user templates that use it (blocks deletion). */
  templates: string[]
  /** Logged sets that used it (history would lose the name). */
  sets: number
}

export async function exerciseUsage(id: string): Promise<ExerciseUsage> {
  const templates = (await db.userTemplates.toArray()).filter((t) => t.items.some((i) => i.exerciseId === id || i.prefer?.includes(id)))
  const sets = await db.sets.where('exerciseId').equals(id).count()
  return { templates: templates.map((t) => t.name), sets }
}

export async function deleteCustomExercise(id: string): Promise<void> {
  await db.customExercises.delete(id)
}

/** A template can't be deleted while a session using it is in progress. */
export async function templateInUse(id: string): Promise<boolean> {
  return (await db.sessions.where('status').equals('in-progress').filter((s) => s.templateIds.includes(id)).count()) > 0
}

export async function deleteUserTemplate(id: string): Promise<void> {
  await db.userTemplates.delete(id)
}
