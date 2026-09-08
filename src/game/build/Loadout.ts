import { abilityDefinition, type AbilityId } from './Ability'
import { heroDefinition, type HeroId } from './Hero'
import { weaponDefinition, type WeaponId } from './Weapon'

export interface Loadout {
  heroId: HeroId
  weaponId: WeaponId
  skillA: AbilityId
  skillB: AbilityId
}

export const DEFAULT_LOADOUT: Readonly<Loadout> = {
  heroId: 'apple-inu',
  weaponId: 'mouthblade',
  skillA: 'zoomies',
  skillB: 'vampiric-bite',
}

export function validateLoadout(loadout: Loadout): Loadout {
  heroDefinition(loadout.heroId)
  weaponDefinition(loadout.weaponId)
  abilityDefinition(loadout.skillA)
  abilityDefinition(loadout.skillB)

  if (loadout.skillA === loadout.skillB) throw new Error('Loadout skill slots must be distinct')

  return { ...loadout }
}

export function loadoutFingerprint(loadout: Loadout): string {
  return `${loadout.heroId}|${loadout.weaponId}|${loadout.skillA}|${loadout.skillB}`
}
