import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { setTimeout as delay } from 'node:timers/promises'
import { stripAnsiEscapeSequences } from '../../shared/ansi-escape-sequences'
import type { HostAccountSignInChannel } from '../../shared/host-account-sign-in-types'
import { getAntigravityAccountService } from './native-account-host'

// agy prints its Google link a moment after the login method is chosen.
const LINK_WAIT_MS = 30_000
const TOKEN_WAIT_MS = 60_000
const MENU_MARKER = 'Select login method'
const LINK_START = 'Open the URL below in your browser:'
const LINK_END = 'Copy and paste the URL'
const GOOGLE_LINK = /https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?[A-Za-z0-9%&=._~+-]+/
const TOKEN_FILE = ['.gemini', 'antigravity-cli', 'antigravity-oauth-token'] as const

function findAgy(): string | null {
  const dirs = [...(process.env.PATH ?? '').split(delimiter), join(homedir(), '.local', 'bin')]
  for (const dir of dirs) {
    const candidate = join(dir, 'agy')
    if (dir && existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

/** The link agy printed, rejoined across the lines the terminal wrapped it over. */
export function readAgyGoogleLink(screen: string): string | null {
  const text = stripAnsiEscapeSequences(screen)
  const start = text.lastIndexOf(LINK_START)
  if (start === -1) {
    return null
  }
  const end = text.indexOf(LINK_END, start)
  if (end === -1) {
    return null
  }
  const joined = text
    .slice(start + LINK_START.length, end)
    .replace(/[\s\u2500-\u257f]+/g, '')
  return GOOGLE_LINK.exec(joined)?.[0] ?? null
}

/**
 * Runs agy's own login in a private home so another device can finish it, then saves the result
 * in the Antigravity account vault. The host's active account is not touched.
 */
export async function signInAntigravityForDevice(channel: HostAccountSignInChannel): Promise<void> {
  if (process.platform !== 'linux') {
    throw new Error('Adding Antigravity accounts from another device needs a Linux host.')
  }
  const agy = findAgy()
  if (!agy) {
    throw new Error('Antigravity (agy) is not installed on this host.')
  }
  const home = await mkdtemp(join(tmpdir(), 'orca-agy-login-'))
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    TERM: 'xterm-256color',
    BROWSER: '/bin/false',
    ORCA_AGY_BIN: agy
  }
  // A desktop keyring would take the token away from the file this reads.
  delete env.DBUS_SESSION_BUS_ADDRESS
  // `script` gives agy the terminal it insists on; the wide window keeps the link on few lines.
  const child = spawn('script', ['-qfec', 'stty cols 2000 rows 50; exec "$ORCA_AGY_BIN"', '/dev/null'], {
    cwd: home,
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let screen = ''
  // Box-drawing glyphs are multi-byte and may straddle two reads.
  const decoder = new StringDecoder('utf8')
  child.stdout.on('data', (chunk: Buffer) => {
    screen = `${screen}${decoder.write(chunk)}`.slice(-200_000)
  })
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  const stop = (): void => {
    child.kill('SIGKILL')
  }
  channel.signal.addEventListener('abort', stop, { once: true })
  try {
    await untilScreen(() => screen.includes(MENU_MARKER), LINK_WAIT_MS, channel.signal, () => screen)
    child.stdin.write('\r')
    await untilScreen(() => readAgyGoogleLink(screen) !== null, LINK_WAIT_MS, channel.signal, () => screen)
    const url = readAgyGoogleLink(screen)
    if (!url) {
      throw new Error('Antigravity did not give a sign-in link.')
    }
    channel.onPrompt({ url, userCode: null, needsCode: true })
    const code = (await channel.nextCode()).trim()
    child.stdin.write(`${code}\r`)
    const tokenPath = join(home, ...TOKEN_FILE)
    await untilScreen(() => existsSync(tokenPath), TOKEN_WAIT_MS, channel.signal, () => screen)
    // agy writes the file in one step, but give a slow disk a moment before reading it.
    await delay(500)
    await getAntigravityAccountService({ runtime: 'host' }).importCredential(
      await readFile(tokenPath, 'utf8')
    )
  } finally {
    channel.signal.removeEventListener('abort', stop)
    stop()
    await Promise.race([exited, delay(3_000)])
    await rm(home, { recursive: true, force: true }).catch(() => {})
  }
}

async function untilScreen(
  ready: () => boolean,
  timeoutMs: number,
  signal: AbortSignal,
  screen: () => string
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!ready()) {
    signal.throwIfAborted()
    if (Date.now() > deadline) {
      const tail = stripAnsiEscapeSequences(screen()).replace(/\s+/g, ' ').trim().slice(-200)
      throw new Error(`Antigravity sign-in did not finish in time.${tail ? ` Last output: ${tail}` : ''}`)
    }
    await delay(250, undefined, { signal })
  }
}
