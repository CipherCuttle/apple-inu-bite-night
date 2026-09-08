export interface ImpactProfile {
  hitStopMs: number
  shakeDurationMs: number
  shakeIntensity: number
  sfxWeight: 'none' | 'light' | 'heavy' | 'massacre'
}

export function getImpactProfile(hitCount: number, killCount: number): ImpactProfile {
  if (killCount >= 8) {
    return { hitStopMs: 32, shakeDurationMs: 64, shakeIntensity: 0.0042, sfxWeight: 'massacre' }
  }
  if (killCount >= 3) {
    return { hitStopMs: 20, shakeDurationMs: 48, shakeIntensity: 0.003, sfxWeight: 'heavy' }
  }
  if (killCount >= 1) {
    return { hitStopMs: 10, shakeDurationMs: 30, shakeIntensity: 0.002, sfxWeight: 'heavy' }
  }
  if (hitCount >= 1) {
    return { hitStopMs: 5, shakeDurationMs: 16, shakeIntensity: 0.001, sfxWeight: 'light' }
  }
  return { hitStopMs: 0, shakeDurationMs: 0, shakeIntensity: 0, sfxWeight: 'none' }
}
