import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const manifestPath = path.join(root, 'licenses', 'ASSET_MANIFEST.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

let mismatches = 0
let unpinnedPresent = 0
let present = 0
let missing = 0

for (const source of manifest.sources ?? []) {
  const archive = source.archive
  if (!archive?.staging_path) continue

  const localPath = path.join(root, archive.staging_path)
  let info
  try {
    info = await stat(localPath)
  } catch {
    missing += 1
    console.log(`MISSING   ${source.id}`)
    console.log(`          ${archive.staging_path}`)
    continue
  }

  if (!info.isFile()) {
    mismatches += 1
    console.error(`INVALID   ${source.id}: staging path is not a file`)
    continue
  }

  const bytes = await readFile(localPath)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  present += 1

  console.log(`PRESENT   ${source.id}`)
  console.log(`          file:   ${archive.staging_path}`)
  console.log(`          bytes:  ${bytes.length}`)
  console.log(`          sha256: ${sha256}`)

  if (!archive.sha256) {
    unpinnedPresent += 1
    console.log('          status: UNPINNED — review archive contents, then record this hash before import')
    continue
  }

  if (sha256 !== archive.sha256) {
    mismatches += 1
    console.error(`          status: HASH MISMATCH (expected ${archive.sha256})`)
  } else {
    console.log('          status: HASH MATCH')
  }
}

console.log('')
console.log(`asset inbox audit: ${present} present, ${missing} missing, ${unpinnedPresent} present-but-unpinned, ${mismatches} invalid/mismatch`)

if (mismatches > 0) process.exitCode = 1
else if (unpinnedPresent > 0) process.exitCode = 2
