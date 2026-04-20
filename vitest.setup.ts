// Mock CSS modules
import { vi } from 'vitest'

vi.stubGlobal('CSS', {
  supports: () => false,
})
