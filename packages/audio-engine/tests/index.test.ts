import { expect, test } from 'vitest'
import { AudioEngine, SynthesizerPlayer } from '../src'

test('exports AudioEngine and SynthesizerPlayer', () => {
  expect(AudioEngine).toBeDefined()
  expect(SynthesizerPlayer).toBeDefined()
})
