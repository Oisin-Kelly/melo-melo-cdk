import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { USERNAME_RULE } from '../api/auth-actions'
import { checkCode, checkEmail, checkPassword, checkUsername } from './validation'

describe('checkUsername', () => {
  it.each(['oisin', 'Oisin.Kelly', 'dj_shadow', 'ab', 'a'.repeat(30), '  oisin  '])('accepts %j', (name) => {
    expect(checkUsername(name)).toBeNull()
  })

  it.each(['a', 'a'.repeat(31), 'oisin kelly', 'oisin-kelly', 'oisín', 'a/b', ''])(
    'explains the rule for %j',
    (name) => {
      expect(checkUsername(name)).toBe(USERNAME_RULE)
    },
  )

  it.each(['library', 'Settings', 'assets', 'sw.js', 'robots.txt', 'index.html', 'favicon.svg', 'a.webmanifest'])(
    'refuses the reserved name %j (profiles live at /{username})',
    (name) => {
      expect(checkUsername(name)).toBe("That username isn't available.")
    },
  )

  it.each(['oisin.kelly', 'dj.shadow', 'library_fan'])('allows the ordinary dotted or similar name %j', (name) => {
    expect(checkUsername(name)).toBeNull()
  })
})

// validation.ts mirrors api/Domain/ReservedUsernames.cs ("change both together") — this
// fails if they drift, by checking every C# rule against the client.
describe('reserved usernames stay in sync with the API', () => {
  const source = readFileSync(path.resolve(import.meta.dirname, '../../../../../api/Domain/ReservedUsernames.cs'), 'utf8')
  const wordBlock = source.slice(source.indexOf('Words ='), source.indexOf('];', source.indexOf('Words =')))
  const words = [...wordBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1])
  const extensions = source.match(/GeneratedRegex\(@"\\\.\(([^)]+)\)\$"\)/)![1].split('|')

  it('found the C# lists', () => {
    expect(words.length).toBeGreaterThan(40)
    expect(extensions).toContain('js')
  })

  it('refuses every reserved word the API refuses', () => {
    // Words the username rule already rules out ("u", "sign-in") are refused either way
    for (const word of words) expect(checkUsername(word), word).not.toBeNull()
  })

  it('refuses every file extension the API refuses', () => {
    for (const ext of extensions) expect(checkUsername(`name.${ext}`), ext).toBe("That username isn't available.")
  })
})

describe('checkEmail', () => {
  it.each(['a@b.co', ' oisin@example.com '])('accepts %j', (email) => {
    expect(checkEmail(email)).toBeNull()
  })

  it.each(['', 'oisin', 'oisin@', 'oisin@example', 'oi sin@example.com', 'a@b.c'])('rejects %j', (email) => {
    expect(checkEmail(email)).toBe('Enter a valid email.')
  })
})

describe('checkPassword', () => {
  it('accepts a password with every character class', () => {
    expect(checkPassword('Abcdef1!')).toBeNull()
  })

  it.each([
    ['Ab1!', 'Use at least 8 characters.'],
    ['abcdefg1!', 'Use both upper and lower case letters.'],
    ['ABCDEFG1!', 'Use both upper and lower case letters.'],
    ['Abcdefgh!', 'Add a number.'],
    ['Abcdefgh1', 'Add a symbol.'],
  ])('%j → %s', (password, message) => {
    expect(checkPassword(password)).toBe(message)
  })
})

describe('checkCode', () => {
  it.each(['123456', ' 123456 '])('accepts %j', (code) => {
    expect(checkCode(code)).toBeNull()
  })

  it.each(['12345', '1234567', 'abcdef', ''])('rejects %j', (code) => {
    expect(checkCode(code)).toBe('Enter the 6-digit code from the email.')
  })
})
