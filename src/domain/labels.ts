// Display labels for the fixed vocabularies in types.ts. (Machine-specific vocab, like Bowflex
// pulleys, lives in each equipment's JSON file instead.)
import type { Accessory, BandAnchor, BandType, Category, MovementPattern } from './types.ts'

export const CATEGORY_LABELS: Record<Category, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  back: 'Back',
  arms: 'Arms',
  core: 'Core',
  legs: 'Legs',
  agility: 'Agility',
  cardio: 'Cardio',
  mobility: 'Mobility',
}

export const PATTERN_LABELS: Record<MovementPattern, string> = {
  'horizontal-push': 'Horizontal push',
  'horizontal-pull': 'Horizontal pull',
  'vertical-push': 'Vertical push',
  'vertical-pull': 'Vertical pull',
  squat: 'Squat',
  lunge: 'Lunge / single-leg',
  hinge: 'Hinge',
  'hip-abduction': 'Hip abduction',
  'hip-adduction': 'Hip adduction',
  'hip-extension': 'Hip extension',
  'hip-flexion': 'Hip flexion',
  'anti-rotation': 'Anti-rotation',
  'trunk-flexion': 'Trunk flexion',
  rotation: 'Rotation',
  'elbow-flexion': 'Elbow flexion',
  'elbow-extension': 'Elbow extension',
  'shoulder-isolation': 'Shoulder isolation',
  'carry-agility': 'Carry / agility',
  mobility: 'Mobility',
  cardio: 'Cardio',
}

export const BAND_TYPE_LABELS: Record<BandType, string> = {
  'mini-loop': 'Mini loop',
  'long-loop': 'Long loop',
  tube: 'Tube with handles',
}

export const ANCHOR_LABELS: Record<BandAnchor, string> = {
  none: 'No anchor',
  'under-feet': 'Under your feet',
  'door-low': 'Door anchor, low',
  'door-mid': 'Door anchor, chest height',
  'door-high': 'Door anchor, high',
  'around-legs': 'Around your legs',
}

export const ACCESSORY_LABELS: Record<Accessory, string> = {
  'door-anchor': 'Door anchor',
  handles: 'Handles',
  'ankle-straps': 'Ankle straps',
}
