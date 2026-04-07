import child_process from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

import {
  $,
  getDiff,
  serialize,
  getMissing,
  getUnused,
  validatePath,
  parseEnvFile,
  printDiff,
  getRemoteSecrets,
} from './index.mjs'

describe('getDiff', () => {
  it('returns diff between local and remote', () => {
    const local = ['A', 'B', 'C']
    const remote = ['B', 'C', 'D']
    const result = getDiff(local, remote)
    expect(result).toEqual({
      localDiff: ['A'],
      remoteDiff: ['D'],
    })
  })
})

describe('serialize', () => {
  it('serializes key/value pairs', () => {
    const local = { A: '1', B: '2' }
    const serializer = serialize(local)
    expect(serializer('A')).toBe('A="1"')
    expect(serializer('B')).toBe('B="2"')
  })
})

describe('getMissing', () => {
  it('returns missing variables', () => {
    const local = { A: '1', B: '2', C: '3' }
    const remote = ['B', 'C', 'D']
    const result = getMissing(local, remote)
    expect(result).toEqual({
      missingArr: ['A'],
      missingStr: 'A="1"',
    })
  })
})

describe('getUnused', () => {
  it('returns unused variables', () => {
    const local = { A: '1', B: '2', C: '3' }
    const remote = ['B', 'C', 'D']
    const result = getUnused(local, remote)
    expect(result).toEqual({
      unusedArr: ['D'],
      unusedStr: 'D',
    })
  })
})

describe('matches', () => {
  it('supports exact, prefix, suffix, and contains matching', () => {
    expect(matches('FOO', 'FOO')).toBe(true)
    expect(matches('FOO', 'BAR')).toBe(false)
    expect(matches('FOO_*', 'FOO_BAR')).toBe(true)
    expect(matches('FOO_*', 'BAR_FOO')).toBe(false)
    expect(matches('*_BAR', 'FOO_BAR')).toBe(true)
    expect(matches('*_BAR', 'BAR_FOO')).toBe(false)
    expect(matches('*MID*', 'HAS_MID_VALUE')).toBe(true)
    expect(matches('*MID*', 'HAS_VALUE')).toBe(false)
  })
})

describe('validatePath', () => {
  const testEnvPath = path.resolve(process.cwd(), '.test.env')

  beforeAll(async () => {
    await fs.writeFile(testEnvPath, 'TEST_VAR=123\nANOTHER_VAR=456')
  })

  afterAll(async () => {
    await fs.unlink(testEnvPath)
  })

  it('resolves and validates an existing path', async () => {
    const resolvedPath = await validatePath('.test.env')
    expect(resolvedPath).toBe(testEnvPath)
  })
})

describe('parseEnvFile', () => {
  const testEnvPath = path.resolve(process.cwd(), '.test.env')

  beforeAll(async () => {
    await fs.writeFile(
      testEnvPath,
      'TEST_VAR=123\nANOTHER_VAR=456\nLOCAL_VAR=789'
    )
  })

  afterAll(async () => {
    await fs.unlink(testEnvPath)
  })

  it('parses env file without filters', async () => {
    const result = await parseEnvFile({
      app: 'test',
      reveal: false,
      'env-file': '.test.env',
    })
    expect(result).toEqual({
      TEST_VAR: '123',
      ANOTHER_VAR: '456',
      LOCAL_VAR: '789',
    })
  })

  it('parses env file with exact string filter', async () => {
    const result = await parseEnvFile({
      app: 'test',
      reveal: false,
      'env-file': '.test.env',
      filter: ['LOCAL_VAR'],
    })
    expect(result).toEqual({
      TEST_VAR: '123',
      ANOTHER_VAR: '456',
    })
  })

  it('parses env file with pattern filter', async () => {
    const result = await parseEnvFile({
      app: 'test',
      reveal: false,
      'env-file': '.test.env',
      filter: ['LOCAL_*'],
    })
    expect(result).toEqual({
      TEST_VAR: '123',
      ANOTHER_VAR: '456',
    })
  })
})

describe('$', () => {
  it('executes a command and returns stdout', async () => {
    const result = await $('echo', ['hello'], false)
    expect(result).toBe('hello\n')
  })

  it('rejects on command failure', async () => {
    await expect($('ls', ['/nonexistent/path'], false)).rejects.toThrow()
  })
})

describe('getRemoteSecrets', () => {
  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('returns a list of secret names', async () => {
    const spawnSpy = vi
      .spyOn(child_process, 'spawn')
      .mockImplementation((/** @type {string} */ cmd) => {
        const emitter = /** @type {any} */ (new EventEmitter())
        emitter.stdout = new EventEmitter()
        emitter.stderr = new EventEmitter()

        setTimeout(() => {
          if (cmd === 'flyctl') {
            emitter.stdout.emit(
              'data',
              JSON.stringify([
                { name: 'SECRET_1', digest: '123' },
                { name: 'SECRET_2', digest: '456' },
              ])
            )
          }
          emitter.emit('exit', 0, null)
        }, 0)

        return /** @type {import('node:child_process').ChildProcess} */ (
          emitter
        )
      })

    const result = await getRemoteSecrets({
      app: 'test-app',
      reveal: false,
      'env-file': '.test.env',
    })
    expect(result).toEqual(['SECRET_1', 'SECRET_2'])

    spawnSpy.mockRestore()
  })
})

describe('printDiff', () => {
  const testEnvPath = path.resolve(process.cwd(), '.test.env')

  beforeAll(async () => {
    await fs.writeFile(testEnvPath, 'LOCAL_A=123\nSHARED=456')
  })

  afterAll(async () => {
    await fs.unlink(testEnvPath)
    vi.restoreAllMocks()
  })

  it('logs the diff table and missing/unused info', async () => {
    // Mock child_process.spawn to return fake flyctl secrets
    const spawnSpy = vi
      .spyOn(child_process, 'spawn')
      .mockImplementation((/** @type {string} */ cmd) => {
        const emitter = /** @type {any} */ (new EventEmitter())
        emitter.stdout = new EventEmitter()
        emitter.stderr = new EventEmitter()

        setTimeout(() => {
          if (cmd === 'flyctl') {
            emitter.stdout.emit(
              'data',
              JSON.stringify([
                { name: 'REMOTE_A', digest: '123' },
                { name: 'SHARED', digest: '456' },
              ])
            )
          }
          emitter.emit('exit', 0, null)
        }, 0)

        return /** @type {import('node:child_process').ChildProcess} */ (
          emitter
        )
      })

    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    await printDiff({
      app: 'test-app',
      'env-file': '.test.env',
      filter: [],
      reveal: false,
    })

    expect(tableSpy).toHaveBeenCalled()
    const tableArg = tableSpy.mock.calls[0]?.[0]

    expect(tableArg).toEqual([
      { '.test.env (local)': 'LOCAL_A', 'test-app (remote)': '❌' },
      { '.test.env (local)': '❌', 'test-app (remote)': 'REMOTE_A' },
      { '.test.env (local)': 'SHARED', 'test-app (remote)': 'SHARED' },
    ])

    expect(infoSpy).toHaveBeenCalledTimes(2)
    expect(infoSpy.mock.calls[0]?.[0]).toContain('Add missing')
    expect(infoSpy.mock.calls[0]?.[0]).toContain('LOCAL_A="*****"')

    expect(infoSpy.mock.calls[1]?.[0]).toContain('Remove unused')
    expect(infoSpy.mock.calls[1]?.[0]).toContain('REMOTE_A')

    spawnSpy.mockRestore()
    tableSpy.mockRestore()
    infoSpy.mockRestore()
  })
})
