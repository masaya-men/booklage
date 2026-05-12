import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { handleDBBlocked, handleDBBlocking } from '@/lib/storage/indexeddb'

const COOLDOWN_KEY = 'booklage:idb-blocked-reload-at'

describe('IDB version-mismatch graceful-recovery handlers', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    window.sessionStorage.clear()
  })

  afterEach(() => {
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    window.sessionStorage.clear()
  })

  describe('handleDBBlocked (auto-reload safety net)', () => {
    it('sets the cooldown marker in sessionStorage on first invocation', () => {
      expect(window.sessionStorage.getItem(COOLDOWN_KEY)).toBeNull()
      handleDBBlocked(12, 13)
      const stored = window.sessionStorage.getItem(COOLDOWN_KEY)
      expect(stored).not.toBeNull()
      expect(Number(stored)).toBeGreaterThan(Date.now() - 1_000)
    })

    it('skips reload (logs an error) when called again within the cooldown window', () => {
      window.sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()))
      handleDBBlocked(12, 13)
      expect(errorSpy).toHaveBeenCalledTimes(1)
      // Cooldown timestamp should be unchanged: still the original write
      const stored = Number(window.sessionStorage.getItem(COOLDOWN_KEY))
      expect(Date.now() - stored).toBeLessThan(1_000)
    })

    it('re-arms the reload once the cooldown window has expired', () => {
      // 31 seconds ago — past the 30s cooldown
      window.sessionStorage.setItem(COOLDOWN_KEY, String(Date.now() - 31_000))
      handleDBBlocked(12, 13)
      const stored = Number(window.sessionStorage.getItem(COOLDOWN_KEY))
      // Should have written a fresh timestamp
      expect(Date.now() - stored).toBeLessThan(1_000)
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('tolerates a null blockedVersion (matches idb typing) without throwing', () => {
      expect(() => handleDBBlocked(12, null)).not.toThrow()
    })

    it('treats a non-numeric cooldown value as "no recent reload"', () => {
      window.sessionStorage.setItem(COOLDOWN_KEY, 'garbage')
      handleDBBlocked(12, 13)
      // Garbage → Number(...) is NaN → fails the recency check → fresh write
      const stored = Number(window.sessionStorage.getItem(COOLDOWN_KEY))
      expect(Date.now() - stored).toBeLessThan(1_000)
    })
  })

  describe('handleDBBlocking (close-our-connection)', () => {
    it('closes the IDBDatabase target so the other tab can upgrade', () => {
      const closeSpy = vi.fn()
      const fakeDB = { close: closeSpy } as unknown as IDBDatabase
      const fakeEvent = { target: fakeDB } as unknown as IDBVersionChangeEvent

      handleDBBlocking(12, 13, fakeEvent)
      expect(closeSpy).toHaveBeenCalledTimes(1)
    })

    it('does not throw when event.target lacks a close() method', () => {
      const fakeEvent = { target: null } as unknown as IDBVersionChangeEvent
      expect(() => handleDBBlocking(12, 13, fakeEvent)).not.toThrow()
    })
  })

  describe('wired into openDB (integration check)', () => {
    it('calls the blocked handler when a higher version is opened against a live older connection', async () => {
      // Use a separate DB name so this does not interfere with production state.
      const { openDB } = await import('idb')
      const dbName = `booklage-test-blocked-${crypto.randomUUID()}`

      // 1. Open v1 and keep the connection alive (simulates the "other tab")
      const db1 = await openDB(dbName, 1, {
        upgrade(db) {
          db.createObjectStore('items')
        },
      })

      // 2. Open v2 with our handlers wired. db1 is still open → blocked fires.
      const db2Promise = openDB(dbName, 2, {
        blocked: handleDBBlocked,
        blocking: handleDBBlocking,
        upgrade() {
          /* no-op */
        },
      })

      // Poll up to 500ms for the blocked event to propagate through fake-indexeddb.
      // The cooldown marker is the observable side effect of our handler firing.
      for (let i = 0; i < 50; i++) {
        if (window.sessionStorage.getItem(COOLDOWN_KEY) !== null) break
        await new Promise((r) => setTimeout(r, 10))
      }
      expect(window.sessionStorage.getItem(COOLDOWN_KEY)).not.toBeNull()

      // Cleanup: close db1 so db2Promise can resolve, then teardown
      db1.close()
      const db2 = await db2Promise
      db2.close()
      indexedDB.deleteDatabase(dbName)
    })
  })
})
