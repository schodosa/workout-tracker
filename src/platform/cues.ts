// Sound and vibration cues for timers.
//
// iOS rules this works around:
// - Audio may only start after a user tap. We create/resume the AudioContext inside a tap
//   (unlockAudio, called from "Log set"), after which timer-triggered beeps are allowed.
// - The ring/silent switch mutes Web Audio, and timers can't fire while the phone is locked.
//   So the on-screen flash is the primary cue; sound is a bonus.
// - navigator.vibrate doesn't exist on iOS; it's used only where supported (Android).

let ctx: AudioContext | null = null

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
}

/** Three short beeps, generated with an oscillator (no audio files to download or cache). */
export function playRestOverCue(): void {
  navigator.vibrate?.([200, 100, 200])
  if (!ctx || ctx.state !== 'running') return
  const start = ctx.currentTime
  for (let i = 0; i < 3; i++) {
    const t = start + i * 0.25
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.2)
  }
}

/** One short, higher beep: "go" (a transition is over, or switch sides). */
export function playGoCue(): void {
  navigator.vibrate?.(150)
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = 1320
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + 0.3)
}
