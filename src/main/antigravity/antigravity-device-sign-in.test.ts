import { describe, expect, it } from 'vitest'
import { readAgyGoogleLink } from './antigravity-device-sign-in'

const LINK =
  'https://accounts.google.com/o/oauth2/auth?access_type=offline&client_id=abc.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback&response_type=code&scope=openid&state=losMV8_e980qqGfWoZZf7w'

function screen(body: string): string {
  return `\u001b[2J Signing in...Open the URL below in your browser:\r\n ${'─'.repeat(40)}\r\n${body}\r\n ${'─'.repeat(40)}\r\n\r\n Copy and paste the URL or click on the link below:\r\n → Click here`
}

describe('readAgyGoogleLink', () => {
  it('rejoins a link the terminal wrapped over several lines', () => {
    const wrapped = LINK.match(/.{1,60}/g)?.map((line) => ` ${line}   `).join('\r\n') ?? ''
    expect(readAgyGoogleLink(screen(wrapped))).toBe(LINK)
  })

  it('drops glyphs that follow the link on its last line', () => {
    expect(readAgyGoogleLink(screen(` ${LINK}�� `))).toBe(LINK)
  })

  it('waits until the whole link is on screen', () => {
    expect(readAgyGoogleLink('Open the URL below in your browser:\r\n https://accounts.goo')).toBeNull()
  })

  it('refuses a link that is not Google sign-in', () => {
    expect(readAgyGoogleLink(screen(' https://evil.example/o/oauth2/auth?state=x '))).toBeNull()
  })
})
