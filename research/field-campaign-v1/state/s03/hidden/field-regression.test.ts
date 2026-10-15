import { deepStrictEqual } from 'node:assert'
import { test } from 'node:test'
import { deepMap, listenKeys, map } from '../index.js'

test('listens for deep keys on whole-store set', () => {
  let events: string[] = []
  let $store = deepMap({ profile: { age: 1, name: 'a' } })

  let unbind = listenKeys($store, ['profile.name'], value => {
    events.push(value.profile.name)
  })

  // a whole-store set that changes the watched path fires
  $store.set({ profile: { age: 1, name: 'b' } })
  deepStrictEqual(events, ['b'])

  // an unrelated sibling under the same parent does not
  $store.set({ profile: { age: 2, name: 'b' } })
  deepStrictEqual(events, ['b'])

  // setting an identical value does not fire either
  $store.set({ profile: { age: 2, name: 'b' } })
  deepStrictEqual(events, ['b'])

  unbind()
  $store.set({ profile: { age: 2, name: 'c' } })
  deepStrictEqual(events, ['b'])
})

test('listens for array paths on whole-store set', () => {
  let events: (number | undefined)[] = []
  let $store = deepMap<{ list: number[] }>({ list: [1, 2] })

  let unbind = listenKeys($store, ['list[1]'], value => {
    events.push(value.list[1])
  })

  $store.set({ list: [1, 3] })
  deepStrictEqual(events, [3])

  $store.set({ list: [9, 3] })
  deepStrictEqual(events, [3])

  unbind()
})

test('keeps plain map keys containing a dot working', () => {
  let events: string[] = []
  let $store = map<{ 'a.b': string }>({ 'a.b': 'one' })

  let unbind = listenKeys($store, ['a.b'], value => {
    events.push(value['a.b'])
  })

  $store.set({ 'a.b': 'two' })
  deepStrictEqual(events, ['two'])

  $store.set({ 'a.b': 'two' })
  deepStrictEqual(events, ['two'])

  unbind()
})
