import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reserveGoogleRequest } from './budget'

test('daily budget persists across callers and never exceeds the cap under concurrency', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'maps-budget-test-'))
  try {
    const now = Date.UTC(2026, 9, 28, 12)
    const options = { directory, dailyLimit: 3, now }
    const allowed = await Promise.all(Array.from({ length: 8 }, (_, i) => reserveGoogleRequest(`client-${i}`, options)))
    assert.equal(allowed.filter(Boolean).length, 3)
    assert.equal(await reserveGoogleRequest('new-client', { ...options, now: now + 60000 }), false)
    assert.equal(await reserveGoogleRequest('new-client', { ...options, now: now + 86400000 }), true)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('per-client and global minute limits cannot be bypassed with a different address', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'maps-budget-test-'))
  try {
    const options = { directory, now: Date.UTC(2026, 9, 28, 12), dailyLimit: 100 }
    for (let i = 0; i < 10; i++) assert.equal(await reserveGoogleRequest('client', options), true)
    assert.equal(await reserveGoogleRequest('client', options), false)
    for (let i = 0; i < 20; i++) assert.equal(await reserveGoogleRequest(`other-${i}`, options), true)
    assert.equal(await reserveGoogleRequest('another', options), false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('corrupt state fails closed and does not reset the budget', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'maps-budget-test-'))
  try {
    await writeFile(join(directory, 'usage.json'), 'broken')
    assert.equal(await reserveGoogleRequest('client', { directory }), false)
    assert.equal(await reserveGoogleRequest('client', { directory, dailyLimit: -1 }), false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
