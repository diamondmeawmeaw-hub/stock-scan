import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(path.resolve(__dirname, '../../src/app/globals.css'), 'utf8')

describe('scan pastel utilities', () => {
  const utilities = [
    'scan-hero',
    'card-pop',
    'btn-pop',
    'btn-pop-primary',
    'scan-input',
    'stat-pop-ok',
    'stat-pop-bad',
  ]
  for (const name of utilities) {
    it(`มี @utility ${name}`, () => {
      expect(css).toContain(`@utility ${name}`)
    })
  }
})
