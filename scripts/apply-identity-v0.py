#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import math
import sys
import zipfile
from pathlib import Path

import cairosvg
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "public" / "assets"
EXPECTED = {
    "zombies.zip": "979cba6b4e64fd10f496ca56f4576ad379e91ef00616c617366bf53d002964b2",
    "anatomy.zip": "1841dc406f58360a55ac9256345ba68635f0e0840d273091de8785fc66598c88",
    "gore.zip": "59917f2f8aec67316aff9869000d11e19e68b296b7f8f9deb606c587b09c6af5",
    "blood.zip": "386d47da0f6d4b1ce699ef049f204bbec1c6a9312e7efbaab15bd3992f23816f",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(asset_dir: Path) -> None:
    for name, expected in EXPECTED.items():
        path = asset_dir / name
        actual = sha(path)
        if actual != expected:
            raise RuntimeError(f"hash mismatch {name}: {actual} != {expected}")


def trim(im: Image.Image, pad: int = 4) -> Image.Image:
    im = im.convert("RGBA")
    bbox = im.getchannel("A").getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    return im.crop((max(0, l-pad), max(0, t-pad), min(im.width, r+pad), min(im.height, b+pad)))


def normalize(im: Image.Image, target: tuple[int, int], max_fill: int) -> Image.Image:
    im = trim(im, 4).rotate(-90, expand=True, resample=Image.Resampling.BICUBIC)
    im = trim(im, 2)
    scale = min(max_fill / im.width, max_fill / im.height)
    nw, nh = max(1, round(im.width * scale)), max(1, round(im.height * scale))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", target, (0, 0, 0, 0))
    canvas.alpha_composite(im, ((target[0]-nw)//2, (target[1]-nh)//2))
    return canvas


def erase_poly(src: Image.Image, pts: list[tuple[int, int]]) -> Image.Image:
    im = src.copy().convert("RGBA")
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    arr = np.array(im)
    arr[np.array(mask) > 0, 3] = 0
    return Image.fromarray(arr, "RGBA")


def write_apple_inu() -> list[Path]:
    dest = ASSET_ROOT / "characters" / "apple-inu"
    dest.mkdir(parents=True, exist_ok=True)

    body = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    d.polygon([(9,31),(2,24),(4,36),(11,38)], fill="#a67c52", outline="#3f2619")
    for box in [(12,12,27,24),(12,40,27,52),(31,11,43,23),(31,41,43,53)]:
        d.rounded_rectangle(box, radius=4, fill="#a67c52", outline="#3f2619", width=2)
    d.ellipse((11,17,45,47), fill="#d4a574", outline="#3f2619", width=3)
    d.ellipse((18,22,41,42), fill="#f5e6d3")
    d.arc((25,15,49,49), start=65, end=295, fill="#c0392b", width=4)
    body_path = dest / "body.png"
    body.save(body_path)

    head = Image.new("RGBA", (64,64), (0,0,0,0))
    d = ImageDraw.Draw(head)
    d.ellipse((12,9,26,26), fill="#a67c52", outline="#3f2619", width=2)
    d.ellipse((12,38,26,55), fill="#a67c52", outline="#3f2619", width=2)
    d.ellipse((12,13,47,51), fill="#c0392b", outline="#3f2619", width=3)
    d.ellipse((27,28,45,46), fill="#922b21")
    d.ellipse((18,18,25,30), fill="#e8685a")
    d.ellipse((35,24,57,42), fill="#f5c7a9", outline="#3f2619", width=2)
    d.ellipse((50,29,58,37), fill="#171015")
    d.ellipse((29,20,34,25), fill="#141014")
    d.ellipse((29,40,34,45), fill="#141014")
    d.ellipse((30,21,31,22), fill="white")
    d.ellipse((30,41,31,42), fill="white")
    d.rounded_rectangle((16,5,20,17), radius=1, fill="#1e8449")
    d.ellipse((18,3,34,13), fill="#27ae60", outline="#183e23", width=1)
    head_path = dest / "head.png"
    head.save(head_path)

    sword = Image.new("RGBA", (74,16), (0,0,0,0))
    d = ImageDraw.Draw(sword)
    d.rounded_rectangle((1,5,12,11), radius=2, fill="#533541", outline="#1c1520", width=1)
    d.rectangle((10,2,16,14), fill="#d5a830", outline="#30230a", width=1)
    d.polygon([(16,4),(65,4),(73,8),(65,12),(16,12)], fill="#e8edf3", outline="#343b46")
    d.line((20,6,63,6), fill="#ffffff", width=1)
    sword_path = dest / "sword.png"
    sword.save(sword_path)
    return [body_path, head_path, sword_path]


def render_zombie_source(asset_dir: Path, work: Path) -> Path:
    with zipfile.ZipFile(asset_dir / "zombies.zip") as zf:
        svg = zf.read("FreeArt_Topdown_Zombies.svg")
    full = work / "zombies-full.png"
    cairosvg.svg2png(bytestring=svg, write_to=str(full), output_width=1600, output_height=1131)
    return full


def write_zombies(asset_dir: Path, work: Path) -> list[Path]:
    full = Image.open(render_zombie_source(asset_dir, work)).convert("RGBA")
    dest = ASSET_ROOT / "enemies" / "zombies"
    parts_dest = dest / "parts"
    parts_dest.mkdir(parents=True, exist_ok=True)

    # Bboxes frozen from the CC0 source render at 1600x1131.
    brain = full.crop((279,256,480,472))
    dark = full.crop((104,691,353,945))
    walker_path = dest / "walker.png"
    heavy_path = dest / "heavy.png"
    normalize(brain, (72,72), 64).save(walker_path)
    normalize(dark, (78,78), 70).save(heavy_path)

    left_erased = erase_poly(dark, [(0,0),(125,0),(125,135),(95,160),(25,150),(0,85)])
    right_erased = erase_poly(dark, [(75,0),(249,0),(249,100),(220,160),(100,165),(70,135)])
    missing_left = dest / "heavy-missing-left-arm.png"
    missing_right = dest / "heavy-missing-right-arm.png"
    normalize(left_erased, (78,78), 70).save(missing_left)
    normalize(right_erased, (78,78), 70).save(missing_right)

    # Extract the brain zombie's fully separated anatomy from the same source composition.
    exploded = full.crop((1040,520,1500,1040))
    boxes = {
        "arm-left.png": (109,49,176,211),
        "arm-right.png": (248,52,314,214),
        "torso-head.png": (150,215,275,333),
        "leg-left.png": (133,347,196,446),
        "leg-right.png": (224,347,287,446),
    }
    part_paths: list[Path] = []
    for filename, bbox in boxes.items():
        p = trim(exploded.crop(bbox),2).rotate(-90,expand=True,resample=Image.Resampling.BICUBIC)
        p = trim(p,1)
        maxdim = 42 if filename == "torso-head.png" else 34
        scale = min(maxdim/p.width, maxdim/p.height)
        p = p.resize((max(1,round(p.width*scale)),max(1,round(p.height*scale))),Image.Resampling.LANCZOS)
        path = parts_dest / filename
        p.save(path)
        part_paths.append(path)

    return [walker_path, heavy_path, missing_left, missing_right, *part_paths]


def write_gore(asset_dir: Path, work: Path) -> list[Path]:
    gore_extract = work / "gore"
    blood_extract = work / "blood"
    with zipfile.ZipFile(asset_dir / "gore.zip") as zf:
        zf.extractall(gore_extract)
    with zipfile.ZipFile(asset_dir / "blood.zip") as zf:
        zf.extractall(blood_extract)

    gib_dest = ASSET_ROOT / "gore" / "gibs"
    decal_dest = ASSET_ROOT / "gore" / "decals"
    gib_dest.mkdir(parents=True, exist_ok=True)
    decal_dest.mkdir(parents=True, exist_ok=True)
    source = gore_extract / "RC Art - Gore Blood Gibs" / "Sprites"
    results: list[Path] = []
    for n in (1,7,12):
        dst = gib_dest / f"meat-{n}.png"
        dst.write_bytes((source / f"meat gib {n}.png").read_bytes())
        results.append(dst)
    blood_source = blood_extract / "bloodsplat"
    for n in (2,4):
        dst = decal_dest / f"trail-{n}.png"
        dst.write_bytes((blood_source / f"bloodtrail_{n}.png").read_bytes())
        results.append(dst)
    return results


def replace(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    if old not in text:
        raise RuntimeError(f"expected patch anchor not found in {path}: {old[:80]!r}")
    path.write_text(text.replace(old,new,1))


def patch_code() -> None:
    enemy = ROOT / "src/game/enemies/Enemy.ts"
    enemy.write_text("""export type SeveredArm = 'none' | 'left' | 'right'\n\nexport interface EnemyState {\n  id: number\n  active: boolean\n  x: number\n  y: number\n  hp: number\n  speed: number\n  radius: number\n  mass: number\n  vx: number\n  vy: number\n  impulseX: number\n  impulseY: number\n  staggerTicks: number\n  severedArm: SeveredArm\n}\n""")

    pool = ROOT / "src/game/enemies/EnemyPool.ts"
    replace(pool, "      staggerTicks: 0,\n", "      staggerTicks: 0,\n      severedArm: 'none',\n")
    replace(pool, "    enemy.staggerTicks = 0\n    return enemy\n", "    enemy.staggerTicks = 0\n    enemy.severedArm = 'none'\n    return enemy\n")
    replace(pool, "    enemy.staggerTicks = 0\n  }\n}", "    enemy.staggerTicks = 0\n    enemy.severedArm = 'none'\n  }\n}")

    state = ROOT / "src/game/sim/GameState.ts"
    replace(state,
        "      killed: boolean\n      facing: number\n    }",
        "      killed: boolean\n      facing: number\n      severedPart?: 'left-arm' | 'right-arm'\n    }")
    replace(state,
        "      feed(enemy.staggerTicks)\n",
        "      feed(enemy.staggerTicks)\n      feed(enemy.severedArm === 'left' ? 1 : enemy.severedArm === 'right' ? 2 : 0)\n")
    old_hit = """  private hitEnemy(enemy: EnemyState, attack: AttackKind, damage: number, knockback: number, facing: number): void {\n    enemy.hp -= damage\n    const killed = enemy.hp <= 0\n    const hitX = enemy.x\n    const hitY = enemy.y\n\n    if (killed) {\n      this.kills += 1\n      this.enemies.kill(enemy)\n    } else {\n      const impulse = (knockback * IMPULSE_SCALE) / Math.max(0.6, enemy.mass)\n      enemy.impulseX += Math.cos(facing) * impulse\n      enemy.impulseY += Math.sin(facing) * impulse\n      enemy.staggerTicks = Math.max(enemy.staggerTicks, STAGGER_TICKS)\n    }\n\n    this.events.push({\n      type: 'enemy-hit',\n      attack,\n      tick: this.tick,\n      enemyId: enemy.id,\n      x: hitX,\n      y: hitY,\n      killed,\n      facing,\n    })\n  }\n"""
    new_hit = """  private hitEnemy(enemy: EnemyState, attack: AttackKind, damage: number, knockback: number, facing: number): void {\n    enemy.hp -= damage\n    const killed = enemy.hp <= 0\n    const hitX = enemy.x\n    const hitY = enemy.y\n    let severedPart: 'left-arm' | 'right-arm' | undefined\n\n    if (!killed && enemy.severedArm === 'none' && (attack === 'slash' || attack === 'whirlwind')) {\n      const side = ((enemy.id ^ this.tick) & 1) === 0 ? 'left' : 'right'\n      enemy.severedArm = side\n      severedPart = side === 'left' ? 'left-arm' : 'right-arm'\n    }\n\n    if (killed) {\n      this.kills += 1\n      this.enemies.kill(enemy)\n    } else {\n      const impulse = (knockback * IMPULSE_SCALE) / Math.max(0.6, enemy.mass)\n      enemy.impulseX += Math.cos(facing) * impulse\n      enemy.impulseY += Math.sin(facing) * impulse\n      enemy.staggerTicks = Math.max(enemy.staggerTicks, STAGGER_TICKS)\n    }\n\n    this.events.push({\n      type: 'enemy-hit',\n      attack,\n      tick: this.tick,\n      enemyId: enemy.id,\n      x: hitX,\n      y: hitY,\n      killed,\n      facing,\n      severedPart,\n    })\n  }\n"""
    replace(state, old_hit, new_hit)

    scene = ROOT / "src/game/scenes/GameScene.ts"
    replace(scene, "const SLASH_TRAIL_ANGLES = [-0.72, -0.36, 0, 0.36, 0.72]\n", "const SLASH_TRAIL_ANGLES = [-0.72, -0.36, 0, 0.36, 0.72]\nconst SWORD_MOUTH_X = 26\n")
    replace(scene, "  private sword!: Phaser.GameObjects.Rectangle\n", "  private sword!: Phaser.GameObjects.Image\n")
    replace(scene, "  create(): void {\n    this.createPlaceholderTextures()\n", """  preload(): void {\n    this.load.image('apple-inu-body', 'assets/characters/apple-inu/body.png')\n    this.load.image('apple-inu-head', 'assets/characters/apple-inu/head.png')\n    this.load.image('apple-inu-sword', 'assets/characters/apple-inu/sword.png')\n    this.load.image('zombie-walker', 'assets/enemies/zombies/walker.png')\n    this.load.image('zombie-heavy', 'assets/enemies/zombies/heavy.png')\n    this.load.image('zombie-heavy-missing-left-arm', 'assets/enemies/zombies/heavy-missing-left-arm.png')\n    this.load.image('zombie-heavy-missing-right-arm', 'assets/enemies/zombies/heavy-missing-right-arm.png')\n    this.load.image('zombie-part-arm-left', 'assets/enemies/zombies/parts/arm-left.png')\n    this.load.image('zombie-part-arm-right', 'assets/enemies/zombies/parts/arm-right.png')\n    this.load.image('zombie-part-leg-left', 'assets/enemies/zombies/parts/leg-left.png')\n    this.load.image('zombie-part-leg-right', 'assets/enemies/zombies/parts/leg-right.png')\n    this.load.image('zombie-part-torso-head', 'assets/enemies/zombies/parts/torso-head.png')\n    this.load.image('gore-meat-1', 'assets/gore/gibs/meat-1.png')\n    this.load.image('gore-meat-7', 'assets/gore/gibs/meat-7.png')\n    this.load.image('gore-meat-12', 'assets/gore/gibs/meat-12.png')\n    this.load.image('gore-blood-trail-2', 'assets/gore/decals/trail-2.png')\n    this.load.image('gore-blood-trail-4', 'assets/gore/decals/trail-4.png')\n  }\n\n  create(): void {\n""")
    old_render = """      sprite\n        .setVisible(true)\n        .setPosition(WORLD_CX + enemy.x, WORLD_CY + enemy.y)\n        .setRotation(Math.atan2(enemy.vy, enemy.vx) + wobble)\n        .setScale(enemy.radius / 12)\n        .setTint(enemy.mass > 1.35 ? 0xa28755 : enemy.id % 3 === 0 ? 0x6f8950 : 0x7b9954)\n"""
    new_render = """      const texture =\n        enemy.mass > 1.35\n          ? enemy.severedArm === 'left'\n            ? 'zombie-heavy-missing-left-arm'\n            : enemy.severedArm === 'right'\n              ? 'zombie-heavy-missing-right-arm'\n              : 'zombie-heavy'\n          : 'zombie-walker'\n      sprite\n        .setTexture(texture)\n        .setVisible(true)\n        .setPosition(WORLD_CX + enemy.x, WORLD_CY + enemy.y)\n        .setRotation(Math.atan2(enemy.vy, enemy.vx) + wobble)\n        .setScale(enemy.radius / 24)\n        .clearTint()\n"""
    replace(scene, old_render, new_render)
    start = scene.read_text().index("  private createPlayer(): void {")
    end = scene.read_text().index("\n  private animateSword", start)
    text = scene.read_text()
    new_player = """  private createPlayer(): void {\n    const bladeLength = BASE_SWORD.outerRadius - BASE_SWORD.innerRadius\n    const makeTrail = (angle: number) =>\n      this.add\n        .rectangle(SWORD_MOUTH_X, 0, bladeLength, 11, 0xff4f8d, 1)\n        .setOrigin(0, 0.5)\n        .setRotation(angle)\n        .setAlpha(0)\n\n    this.swordTrails = SLASH_TRAIL_ANGLES.map(makeTrail)\n    const body = this.add.image(-4, 0, 'apple-inu-body').setScale(0.78)\n    const head = this.add.image(13, 0, 'apple-inu-head').setScale(0.74)\n    this.sword = this.add.image(SWORD_MOUTH_X, 0, 'apple-inu-sword').setOrigin(0, 0.5)\n\n    // Sword is behind the head so the muzzle visibly clamps the hilt.\n    this.headRig = this.add.container(0, 0, [...this.swordTrails, this.sword, head])\n    this.player = this.add.container(WORLD_CX, WORLD_CY, [body, this.headRig]).setDepth(10)\n  }\n"""
    scene.write_text(text[:start] + new_player + text[end:])
    text = scene.read_text()
    text = text.replace("this.sword.setPosition(BASE_SWORD.innerRadius, 0)", "this.sword.setPosition(SWORD_MOUTH_X, 0)")
    text = text.replace("this.sword.setX(BASE_SWORD.innerRadius - 5)", "this.sword.setX(SWORD_MOUTH_X - 5)")
    text = text.replace("x: BASE_SWORD.innerRadius + 24", "x: SWORD_MOUTH_X + 24")
    text = text.replace("this.sword.setX(BASE_SWORD.innerRadius - 7)", "this.sword.setX(SWORD_MOUTH_X - 7)")
    text = text.replace("x: BASE_SWORD.innerRadius + 38", "x: SWORD_MOUTH_X + 38")
    text = text.replace("const zombie = this.add.image(-9999, -9999, 'zombie-placeholder')", "const zombie = this.add.image(-9999, -9999, 'zombie-walker')")
    method = "  private createPlaceholderTextures(): void {"
    if method in text:
        ms = text.index(method)
        me = text.index("\n  private showRunEnded", ms)
        text = text[:ms] + text[me:]
    scene.write_text(text)

    gore = ROOT / "src/presentation/GoreFx.ts"
    text = gore.read_text()
    text = text.replace("const LIMB_TEXTURES = ['zombie-arm', 'zombie-leg'] as const", "const LIMB_TEXTURES = ['zombie-part-arm-left', 'zombie-part-arm-right', 'zombie-part-leg-left', 'zombie-part-leg-right'] as const")
    text = text.replace("'meat-gib'", "'gore-meat-1'")
    text = text.replace("`blood-splat-${i % 3}`", "i % 2 === 0 ? 'gore-blood-trail-2' : 'gore-blood-trail-4'")
    old_minor = """      if (hit.attack === 'slash' || hit.attack === 'whirlwind') {\n        this.spawnDismemberment(hit, 1, cameraX, cameraY, false)\n        this.spawnDecal(hit, cameraX, cameraY, 0.5)\n      }\n"""
    new_minor = """      if (hit.severedPart) this.spawnSeveredPart(hit, cameraX, cameraY)\n      if (hit.attack === 'slash' || hit.attack === 'whirlwind') this.spawnDecal(hit, cameraX, cameraY, 0.5)\n"""
    if old_minor not in text:
        raise RuntimeError("GoreFx minor anchor missing")
    text = text.replace(old_minor, new_minor, 1)
    text = text.replace("const texture = includeHead && i === 0 ? 'zombie-head' : LIMB_TEXTURES[(i + rng.int(0, 1)) % LIMB_TEXTURES.length]", "const texture = includeHead && i === 0 ? 'zombie-part-torso-head' : LIMB_TEXTURES[(i + rng.int(0, LIMB_TEXTURES.length - 1)) % LIMB_TEXTURES.length]")
    text = text.replace(".setTexture(rng.next() < 0.22 ? 'bone-gib' : 'gore-meat-1')", ".setTexture(rng.next() < 0.34 ? 'gore-meat-7' : rng.next() < 0.5 ? 'gore-meat-12' : 'gore-meat-1')")
    text = text.replace(".setTexture(`blood-splat-${rng.int(0, 2)}`)", ".setTexture(rng.next() < 0.5 ? 'gore-blood-trail-2' : 'gore-blood-trail-4')")
    insert_anchor = "  private spawnDismemberment(\n"
    idx = text.index(insert_anchor)
    sever_method = """  private spawnSeveredPart(\n    hit: Extract<SimEvent, { type: 'enemy-hit' }>,\n    cameraX: number,\n    cameraY: number,\n  ): void {\n    const gib = this.gibs[this.gibCursor]\n    this.gibCursor = (this.gibCursor + 1) % this.gibs.length\n    const rng = new XorShift32((hit.enemyId * 0x7f4a7c15) ^ hit.tick)\n    const texture = hit.severedPart === 'left-arm' ? 'zombie-part-arm-left' : 'zombie-part-arm-right'\n    const angle = hit.facing + rng.range(-0.55, 0.55)\n    const speed = rng.range(5.2, 8.4)\n    gib.vx = Math.cos(angle) * speed\n    gib.vy = Math.sin(angle) * speed\n    gib.spin = rng.range(-0.38, 0.38)\n    gib.lifeMs = rng.int(6500, 10500)\n    gib.sprite\n      .setTexture(texture)\n      .setPosition(hit.x + cameraX, hit.y + cameraY)\n      .setScale(rng.range(0.8, 1.08))\n      .setRotation(rng.range(-Math.PI, Math.PI))\n      .setAlpha(1)\n      .setVisible(true)\n  }\n\n"""
    text = text[:idx] + sever_method + text[idx:]
    # Remove obsolete generated fake meat/bone/limb/head textures while retaining blood-pixel and fallback splats.
    obsolete_start = text.find("    graphics.fillStyle(0x8e1b2f, 1)")
    if obsolete_start != -1:
        text = text[:obsolete_start] + "    graphics.destroy()\n" + text[text.rfind("  }\n}"):]
    gore.write_text(text)

    test = ROOT / "tests" / "anatomy.test.ts"
    test.write_text("""import { describe, expect, it } from 'vitest'\nimport { GameState } from '../src/game/sim/GameState'\n\ndescribe('authoritative zombie anatomy', () => {\n  it('a surviving heavy zombie visibly loses one deterministic arm to a slash', () => {\n    const state = new GameState(0xabc123)\n    for (const enemy of state.enemies.items) enemy.active = false\n    const enemy = state.enemies.items[0]\n    Object.assign(enemy, {\n      id: 7, active: true, x: 62, y: 0, hp: 2, speed: 0, radius: 14, mass: 1.6,\n      vx: 0, vy: 0, impulseX: 0, impulseY: 0, staggerTicks: 0, severedArm: 'none',\n    })\n    state.step({ x: 0, y: 0, aimRadians: 0, slash: true })\n    expect(enemy.active).toBe(true)\n    expect(enemy.hp).toBe(1)\n    expect(['left', 'right']).toContain(enemy.severedArm)\n    const hit = state.events.find((event) => event.type === 'enemy-hit')\n    expect(hit && hit.type === 'enemy-hit' ? hit.severedPart : undefined).toMatch(/^(left|right)-arm$/)\n  })\n})\n""")


def update_manifest(paths: list[Path]) -> None:
    manifest_path = ROOT / "licenses" / "ASSET_MANIFEST.json"
    data = json.loads(manifest_path.read_text())
    hash_by_source = {
        "spriteattack-freeart-topdown-zombies": EXPECTED["zombies.zip"],
        "spriteattack-topdown-soldier": EXPECTED["anatomy.zip"],
        "reactorcore-gore-blood-gibs-meat-chunks": EXPECTED["gore.zip"],
        "overcrafted-bloodsplatter-bloodsplash": EXPECTED["blood.zip"],
    }
    for source in data["sources"]:
        if source["id"] in hash_by_source:
            source["archive"]["sha256"] = hash_by_source[source["id"]]
            source["verification"] = "ARCHIVE_HASH_VERIFIED"
            if source["id"] in {"spriteattack-freeart-topdown-zombies", "reactorcore-gore-blood-gibs-meat-chunks", "overcrafted-bloodsplatter-bloodsplash"}:
                source["intake_status"] = "ARCHIVE_HASH_VERIFIED_CANONICAL_SUBSET_IMPORTED"
    project_source = {
        "id": "project-owned-apple-inu-v0",
        "priority": "P0",
        "purpose": ["canonical player identity"],
        "author": "Apple Inu project",
        "source_page": None,
        "license": "PROJECT_OWNED",
        "verification": "IMPORTED_CANONICAL",
        "intake_status": "PROJECT_OWNED_CANONICAL",
        "shipping_rule": "Preserve apple-red head, green leaf/stem, dog muzzle/ears/paws/tail, and visible mouth-held sword.",
        "destinations": ["public/assets/characters/apple-inu/"]
    }
    if not any(s["id"] == project_source["id"] for s in data["sources"]):
        data["sources"].insert(0, project_source)

    assets = []
    for path in paths:
        rel = path.relative_to(ROOT).as_posix()
        if "apple-inu" in rel:
            source_id, license_id, modified = "project-owned-apple-inu-v0", "PROJECT_OWNED", False
        elif "enemies/zombies" in rel:
            source_id, license_id, modified = "spriteattack-freeart-topdown-zombies", "CC0-1.0", True
        elif "gore/gibs" in rel:
            source_id, license_id, modified = "reactorcore-gore-blood-gibs-meat-chunks", "CC0-1.0", False
        else:
            source_id, license_id, modified = "overcrafted-bloodsplatter-bloodsplash", "CC0-1.0", False
        assets.append({
            "id": rel.replace("public/assets/", "").replace("/", "-").removesuffix(".png"),
            "source_id": source_id,
            "license": license_id,
            "path": rel,
            "sha256": sha(path),
            "modified": modified,
        })
    data["assets"] = assets
    manifest_path.write_text(json.dumps(data, indent=2) + "\n")


def write_docs() -> None:
    (ROOT / "docs" / "IDENTITY_V0.md").write_text("""# Identity V0\n\n## Player\nApple Inu is project-owned art derived from the project's established apple-dog palette and silhouette. The visible rig is split into body, head and sword so the head itself drives slash/stab/dash/whirlwind animation and the muzzle visibly covers the sword hilt.\n\n## Zombies\nWalker/heavy sprites are canonicalized from SpriteAttack's CC0 FreeArt Topdown Zombies source. Heavy survivors have an authoritative `severedArm` state. A qualifying nonlethal slash/whirlwind clears that arm in simulation, selects a matching missing-arm render texture, and emits the same detached arm as a gib.\n\n## Gore\nOnly a tiny curated CC0 subset is imported: three Reactorcore meat gibs and two overcrafted blood-trail decals. Existing GoreBudget/pooling remains authoritative for effect count; presentation still cannot change damage or score.\n\n## Reproducibility\nArchive SHA-256 values are frozen in `licenses/ASSET_MANIFEST.json`. `scripts/audit-asset-inbox.mjs` can check locally staged source archives. Derived production files have per-file SHA-256 entries under `assets[]`.\n""")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: apply-identity-v0.py <verified-asset-dir>")
    asset_dir = Path(sys.argv[1]).resolve()
    verify(asset_dir)
    work = Path("/tmp/bite-identity-work")
    work.mkdir(parents=True, exist_ok=True)
    paths = []
    paths += write_apple_inu()
    paths += write_zombies(asset_dir, work)
    paths += write_gore(asset_dir, work)
    patch_code()
    update_manifest(paths)
    write_docs()
    print(f"identity-v0: wrote {len(paths)} canonical assets")
    for path in paths:
        print(sha(path), path.relative_to(ROOT))


if __name__ == "__main__":
    main()
