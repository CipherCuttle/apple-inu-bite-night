export interface ImpactProfile {
  hitStopMs: number
  shakeDurationMs: number
  shakeIntensity: number
  sfxWeight: 'none' | 'light' | 'heavy' | 'massacre'
}

export function getImpactProfile(hitCount: number, killCount: number): ImpactProfile {
  if (killCount >= 8) {
    return { hitStopMs: 55, shakeDurationMs: 70, shakeIntensity: 0.0045, sfxWeight: 'massacre' }
  }
  if (killCount >= 3) {
    return { hitStopMs: 38, shakeDurationMs: 55, shakeIntensity: 0.0032, sfxWeight: 'heavy' }
  }
  if (killCount >= 1) {
    return { hitStopMs: 22, shakeDurationMs: 34, shakeIntensity: 0.0022, sfxWeight: 'heavy' }
  }
  if (hitCount >= 1) {
    return { hitStopMs: 12, shakeDurationMs: 20, shakeIntensity: 0.0012, sfxWeight: 'light' }
  }
  return { hitStopMs: 0, shakeDurationMs: 0, shakeIntensity: 0, sfxWeight: 'none' }
}
