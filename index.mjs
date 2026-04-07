#!/usr/bin/env node

import child_process from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseArgs, parseEnv, styleText } from 'node:util'

/**
 * @typedef Args
 * @type {object}
 * @property {string} app
 * @property {boolean} [help]
 * @property {string[]} [filter]
 * @property {string} env-file
 * @property {boolean} reveal
 */

/**
 * @typedef {{[k:string]: string}} Obj
 */

/**
 * @returns {void}
 */
function usage() {
  const usageText = `
  Diff your fly.io app secrets with your local .env file.

  Examples:
    Basic:
    $ sdiff --env-file ./myApp/.env --app my-fly-app

    You might want to exclude some env vars that are not really secrets, those
    should be defined in fly.toml:
    $ sdiff --a my-fly-app --filter NODE_ENV --filter PORT --filter TZ

    Or filter out secrets that start with LOCAL_:
    $ sdiff --a my-fly-app --filter '^LOCAL_'

  Usage:
    sdiff [flags]

    Flags:

    -a, --app      : Name of your fly app
    -e, --env-file : Absolute or relative path to your .env file, defaults to
                     ./.env
    -f, --filter   : Multiple values of strings or a regex pattern of keys you
                     want to exclude from the check
    -r, --reveal   : Should the secrets be logged into std out, normally they
                     are obfuscated
    -h, --help     : Show help
`

  console.log(usageText)
}

/** @returns {Args} */
function args() {
  const {
    values: { app, ...values },
  } = parseArgs({
    options: {
      app: { type: 'string', short: 'a' },
      help: { type: 'boolean', short: 'h' },
      filter: { type: 'string', short: 'f', multiple: true },
      'env-file': { type: 'string', short: 'e', default: '.env' },
      reveal: { type: 'boolean', short: 'r', default: false },
    },
  })

  if (!app) throw bail('--app is a required arg', null, true)

  return { app, ...values }
}

/**
 * An async spawn, waits for the child process to finish. Third param toggles
 * the interactive mode, which logs the command output as it runs.
 *
 * @param {string} cmd
 * @param {ReadonlyArray<string>} args
 * @param {boolean} interactive - log stdout during execution
 * @returns {Promise<string>}
 */
export function $(cmd, args, interactive = true) {
  const { promise, resolve, reject } =
    /** @type {PromiseWithResolvers<string>} */ (Promise.withResolvers())
  const spawn = child_process.spawn(cmd, args, { env: process.env })

  /** @type {string[]} */
  const stdoutChunks = []
  /** @type {string[]} */
  const stderrChunks = []

  spawn.stdout.on('data', data => {
    /** @type {string} */
    const dataStr = data.toString()
    if (interactive) console.log(dataStr.trim())
    stdoutChunks.push(dataStr)
  })

  spawn.stderr.on('data', data => {
    /** @type {string} */
    const dataStr = data.toString()
    if (interactive) console.error(dataStr.trim())
    stderrChunks.push(dataStr)
  })

  spawn.on('error', err => {
    // This event is emitted when the process could not be spawned,
    // or killed, or sending a message to a child process failed.
    reject(new Error(`Failed to spawn process: ${err.message}`))
  })

  spawn.on('exit', (code, signal) => {
    const stdout = stdoutChunks.join('')
    const stderr = stderrChunks.join('')

    if (code !== 0) {
      const errorMessage =
        stderr.length > 0
          ? `Command failed with exit code ${code} (signal: ${signal}):\n${stderr}`
          : `Command failed with exit code ${code} (signal: ${signal}).`
      reject(new Error(errorMessage))
    } else {
      resolve(stdout)
    }
  })

  return promise
}

/**
 * @typedef {Object} Logger
 * @property {( ...args: any[] ) => void} info - Logs information messages in blue
 * @property {( ...args: any[] ) => void} error - Logs error messages in red
 * @property {( ...args: any[] ) => void} success - Logs success messages in green
 */

/**
 * A utility for styled console logs
 * @type {Logger}
 */
const log = {
  info: (...x) => console.info(styleText('blue', x.join(' '))),
  error: (...x) => console.error(styleText('red', x.join(' '))),
  success: (...x) => console.log(styleText('green', x.join(' '))),
}

/**
 * Logs message, an optional error, and usage if defined, then exits with 1
 * @param {unknown} message
 * @param {unknown} err
 * @param {boolean} [withUsage]
 * @returns {void}
 */
function bail(message, err = '', withUsage = false) {
  log.error('Err:', message)
  if (err) log.error(err)
  if (withUsage) usage()
  process.exit(1)
}

/**
 * Validates the path to the .env file and returns an absolute path
 * @param {string} str
 * @returns {Promise<string>} - can be a void, actually
 */
export async function validatePath(str) {
  const envPath = path.isAbsolute(str) ? str : path.resolve(process.cwd(), str)
  try {
    // Check if the path exists
    await fs.access(envPath)
    return envPath
  } catch (err) {
    bail(`The path ${envPath} doesn’t exists`, err)
    return ''
  }
}

/** @typedef {{ name: string, digest: string }} FlySecret */

/**
 * @param {Args} args
 * @returns {Promise<string[]>}
 */
export async function getRemoteSecrets(args) {
  try {
    const list = await $('flyctl', [
      'secrets',
      'list',
      '--json',
      '--app',
      args.app,
    ])
    const flySecrets = /** @type {FlySecret[]} */ (JSON.parse(list))

    return flySecrets.map(x => x.name)
  } catch (err) {
    throw bail(`unable to get remote secrets from the app ${args.app}`, err)
  }
}

// If a not a word or a number characters, it's probably a regex
const isReg = /[^\d\w\n]/

/**
 * Read the .env file and parses to JSON
 * @param {Args} args
 * @returns {Promise<Obj>}
 */
export async function parseEnvFile(args) {
  const path = await validatePath(args['env-file'])
  const contents = (await fs.readFile(path)).toString()
  const parsedEnv = /** @type {Obj} */ (parseEnv(contents))

  if (!args.filter) return parsedEnv

  /** @type {Obj} */
  const filteredEnv = {}
  for (const [envVar, val] of Object.entries(parsedEnv)) {
    const isMatch = args.filter.some(x =>
      isReg.test(x) ? new RegExp(x).test(envVar) : envVar === x
    )
    if (!isMatch) filteredEnv[envVar] = val
  }

  return filteredEnv
}

/**
 * Returns the diff between local and remote env vars
 * @param {string[]} local
 * @param {string[]} remote
 * @returns {{ localDiff: string[], remoteDiff: string[] }}
 */
export function getDiff(local, remote) {
  const localDiff = local.filter(x => !remote.includes(x))
  const remoteDiff = remote.filter(x => !local.includes(x))

  return { localDiff, remoteDiff }
}

/**
 * Uses `console.table` to print out a nicely formatted diff between the local
 * and remote env vars
 * @param {Args} args
 * @returns {Promise<void>}
 */
export async function printDiff(args) {
  const remote = await getRemoteSecrets(args)
  const local = await parseEnvFile(args)
  const localKeys = Object.keys(local)

  const both = [...new Set([...localKeys, ...remote])].toSorted()
  const { localDiff, remoteDiff } = getDiff(localKeys, remote)

  const diffTable = both.map(key => ({
    [`${args['env-file']} (local)`]: remoteDiff.includes(key) ? '❌' : key,
    [`${args.app} (remote)`]: localDiff.includes(key) ? '❌' : key,
  }))

  console.table(diffTable)

  const { missingArr, missingStr } = getMissing(local, remote)
  const { unusedArr, unusedStr } = getUnused(local, remote)

  const missing = args.reveal
    ? missingStr
    : `${missingArr.join('="*****" \\ \n   ')}="*****"`

  if (missingArr.length > 0) {
    log.info(
      `\n 🟢 Add missing:
 fly secrets set --app=${args.app} \\
   ${missing}`
    )
  }

  if (unusedArr.length > 0) {
    log.info(
      `\n 🔴 Remove unused:
 fly secrets unset --app=${args.app} \\
   ${unusedStr}`
    )
  }
}

/**
 * Serializes key/value pairs
 * @param {Obj} local
 * @returns string
 */
export function serialize(local) {
  /** @param {string} key */
  return key => `${key}="${local[key]}"`
}

/**
 * @param {Obj} local
 * @param {string[]} remote
 * @returns {{missingArr: string[], missingStr: string}}
 */
export function getMissing(local, remote) {
  const { localDiff } = getDiff(Object.keys(local), remote)
  return {
    missingStr: localDiff.map(serialize(local)).join(' \\ \n   '),
    missingArr: localDiff,
  }
}

/**
 * @param {Obj} local
 * @param {string[]} remote
 * @returns {{unusedArr: string[], unusedStr: string}}
 */
export function getUnused(local, remote) {
  const { remoteDiff } = getDiff(Object.keys(local), remote)
  return {
    unusedStr: remoteDiff.join(' \\ \n   '),
    unusedArr: remoteDiff,
  }
}

/**
 * Runs the script
 * @param {Args} args
 */
async function run(args) {
  if (args.help) {
    usage()
    process.exit(1)
  }

  await printDiff(args)
}

const asScript = process.argv[1] === import.meta.filename

/**
 * Execute the cli
 */
if (asScript) await run(args())
