import { ABILITY_REGISTRY, type AbilityId } from './Ability'
import { HERO_REGISTRY, type HeroId } from './Hero'
import { WEAPON_REGISTRY, type WeaponId } from './Weapon'

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
  if (!Object.hasOwn(HERO_REGISTRY, loadout.heroId)) throw new Error(`Unknown hero: ${String(loadout.heroId)}`)
  if (!Object.hasOwn(WEAPON_REGISTRY, loadout.weaponId)) throw new Error(`Unknown weapon: ${String(loadout.weaponId)}`)
  if (!Object.hasOwn(ABILITY_REGISTRY, loadout.skillA)) throw new Error(`Unknown skill A: ${String(loadout.skillA)}`)
  if (!Object.hasOwn(ABILITY_REGISTRY, loadout.skillB)) throw new Error(`Unknown skill B: ${String(loadout.skillB)}`)
  if (loadout.skillA === loadout.skillB) throw new Error('Loadout skill slots must be distinct')

  return { ...loadout }
}

export function loadoutFingerprint(loadout: Loadout): string {
  return `${loadout.heroId}|${loadout.weaponId}|${loadout.skillA}|${loadout.skillB}`
}
