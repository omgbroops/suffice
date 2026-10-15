import { equal } from 'node:assert'
import { test } from 'node:test'
import { atom, computed, cleanStores } from '../index.js'
process.env.NODE_ENV = 'test'

test('resets computed cache', () => {
  let multiplier = 2
  let computations = 0
  let $source = atom(1)
  let $computed = computed($source, value => {
    computations += 1
    return value * multiplier
  })

  let unbind = $computed.subscribe(() => {})
  equal($computed.get(), 2)
  equal(computations, 1)
  unbind()

  cleanStores($source, $computed)

  multiplier = 10
  let unbind2 = $computed.subscribe(() => {})
  equal($computed.get(), 10)
  equal(computations, 2)
  unbind2()
})
