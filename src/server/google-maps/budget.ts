import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Usage = { day: string; total: number; minute: number; requests: number; clients: Record<string, number> }

// Shared by both Next processes on this VPS and retained across application restarts.
// Storage/lock failure denies requests instead of making unmetered upstream calls.
export async function reserveGoogleRequest(client: string, options: {
  directory?: string; dailyLimit?: number; now?: number
} = {}): Promise<boolean> {
  const directory = options.directory ?? process.env.GOOGLE_MAPS_USAGE_DIR ?? join(tmpdir(), 'spoko-google-maps-usage')
  const limit = options.dailyLimit ?? Number(process.env.GOOGLE_MAPS_DAILY_LIMIT ?? 250)
  if (!Number.isSafeInteger(limit) || limit <= 0) return false
  const now = options.now ?? Date.now()
  const day = new Date(now).toISOString().slice(0, 10)
  const minute = Math.floor(now / 60000)
  const clientId = createHash('sha256').update(client).digest('hex')
  const lock = join(directory, 'lock')
  let locked = false
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    for (let attempt = 0; attempt < 10; attempt++) {
      try { await mkdir(lock); locked = true; break }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    }
    if (!locked) return false
    let usage: Usage
    try { usage = JSON.parse(await readFile(join(directory, 'usage.json'), 'utf8')) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false
      usage = { day, total: 0, minute, requests: 0, clients: {} }
    }
    if (!usage || typeof usage.day !== 'string' || !Number.isSafeInteger(usage.total) || usage.total < 0) return false
    if (usage.day !== day) usage = { day, total: 0, minute, requests: 0, clients: {} }
    if (usage.minute !== minute) { usage.minute = minute; usage.requests = 0; usage.clients = {} }
    if (!Number.isSafeInteger(usage.requests) || !usage.clients || typeof usage.clients !== 'object') return false
    if (usage.total >= limit || usage.requests >= 30 || (usage.clients[clientId] ?? 0) >= 10) return false
    usage.total++; usage.requests++; usage.clients[clientId] = (usage.clients[clientId] ?? 0) + 1
    await writeFile(join(directory, 'usage.tmp'), JSON.stringify(usage), { mode: 0o600 })
    await rename(join(directory, 'usage.tmp'), join(directory, 'usage.json'))
    return true
  } catch { return false }
  finally { if (locked) await rm(lock, { recursive: true }).catch(() => undefined) }
}
