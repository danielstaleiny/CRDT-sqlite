import { Timestamp, MutableTimestamp } from './timestamp.js'
import { v4 as uuidv4 } from 'uuid'

let _clock = null

export function setClock(clock) {
  _clock = clock
}

export function getClock() {
  return _clock
}

export function makeClock(timestamp, merkle = {}) {
  return { timestamp: MutableTimestamp.from(timestamp), merkle }
}

export function serializeClock(clock) {
  return JSON.stringify({
    timestamp: clock.timestamp.toString(),
    merkle: clock.merkle,
  })
}

export function deserializeClock(clock) {
  const data = JSON.parse(clock)
  return {
    timestamp: Timestamp.from(Timestamp.parse(data.timestamp)),
    merkle: data.merkle,
  }
}

export function makeClientId() {
  return uuidv4().replace(/-/g, '').slice(-16)
}
