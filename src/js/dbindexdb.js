import { v4 as uuidv4 } from 'uuid'
import { setClock, getClock, makeClock, makeClientId } from './clock.js'
import { Timestamp, MutableTimestamp } from './timestamp.js'
import { openDB, deleteDB, wrap, unwrap } from 'idb'
import { _onSync } from './sync.js'
import * as merkle from './merkle.js'
import idbReady from 'safari-14-idb-fix'

// Do not await other things between the start and end of your transaction,
// otherwise the transaction will close before you're done.

// openDB :: (String, Int (0<), Object) -> Promise DBconnection
const database = idbReady().then(() =>
  openDB('tododb', 1, {
    // upgrade :: (db, oldVersion, newVersion, transaction)
    upgrade(db, oldVersion, newVersion, transaction) {
      //store
      const store = db.createObjectStore('messages', {
        keyPath: 'id',
        autoIncrement: true,
      })
      store.createIndex('row', 'row', { unique: false })
      store.createIndex('column', 'column', { unique: false })
      store.createIndex('timestamp', 'timestamp', { unique: true })
    },
    blocked() {
      // …
    },
    blocking() {
      // …
    },
    terminated() {
      // …
    },
  })
)

// we want to remove this
let _messages = []
let _data = {
  todos: [],
  todoTypes: [],
  todoTypeMapping: [],
}

export async function insert(table, row) {
  let id = uuidv4()
  let fields = Object.keys(row)

  const msgs = fields.map((k) => {
    return {
      dataset: table,
      row: row.id || id,
      column: k,
      value: row[k],
      timestamp: Timestamp.send(getClock()).toString(),
    }
  })
  // console.log(msgs)

  function apply(msg) {
    let table = _data[msg.dataset]
    if (!table) {
      throw new Error('Unknown dataset: ' + msg.dataset)
    }

    let row = table.find((row) => row.id === msg.row)
    if (!row) {
      table.push({ id: msg.row, [msg.column]: msg.value })
    } else {
      row[msg.column] = msg.value
    }
  }

  async function compareMessages(messages) {
    let existingMessages = new Map()

    // This could be optimized, but keeping it simple for now. Need to
    // find the latest message that exists for the dataset/row/column
    // for each incoming message, so sort it first

    // let sortedMessages = await (
    //   await database
    // ).getAllFromIndex('messages', 'timestamp')
    //
    //
    let cursor = await (await database)
      .transaction('messages')
      .store.index('timestamp')
      .openCursor(null, 'prev')

    let sortedMessages = []
    while (cursor) {
      sortedMessages.push(cursor.value)
      cursor = await cursor.continue()
    }

    console.log(sortedMessages)

    let sMsg = [..._messages].sort((m1, m2) => {
      if (m1.timestamp < m2.timestamp) {
        return 1
      } else if (m1.timestamp > m2.timestamp) {
        return -1
      }
      return 0
    })
    console.log(sMsg)

    messages.forEach((msg1) => {
      let existingMsg = sortedMessages.find(
        (msg2) =>
          msg1.dataset === msg2.dataset &&
          msg1.row === msg2.row &&
          msg1.column === msg2.column
      )

      existingMessages.set(msg1, existingMsg)
    })

    return existingMessages
  }

  const applyM = async (messages) => {
    let existingMessages = await compareMessages(messages)
    let clock = getClock()

    await Promise.all(
      messages.map(async (msg) => {
        let existingMsg = existingMessages.get(msg)

        if (!existingMsg || existingMsg.timestamp < msg.timestamp) {
          apply(msg)
        }

        if (!existingMsg || existingMsg.timestamp !== msg.timestamp) {
          clock.merkle = merkle.insert(
            clock.merkle,
            Timestamp.parse(msg.timestamp)
          )

          _messages.push(msg)
          return (await database).add('messages', msg)
        }
      })
    )

    _onSync && _onSync()
    // // we call callback if there is any
  }

  await applyM(msgs)
  // sync(msgs)

  return id
}

//DATABASE API, what can be called

// get
// getKey
// getAll
// getAllKeys
// count
// put
// add
// delete
// clear

// getFromIndex
// getKeyFromIndex
// getAllFromIndex
// getAllKeysFromIndex
// countFromIndex

// console.log(
//   'getAllFromIndex ',
//   await (await database).getAllFromIndex('articles', 'id')
// )
// // console.log(
// //   'getAllFromIndex ',
// //   await (await database).getAllFromIndex('articles', 'date')
// // )

// console.log(
//   'getAllFromIndex ',
//   await (await database).getAllFromIndex('articles', 'title')
// )
// console.log(
//   'getFromIndex ',
//   await (await database).getFromIndex('articles', 'title', 'Article 1')
// )
// console.log(
//   'getKeyFromIndex ',
//   await (await database).getKeyFromIndex('articles', 'title', 'Article 1')
// )
// console.log(
//   'getAllKeysFromIndex ',
//   await (await database).getAllKeysFromIndex('articles', 'title', 'Article 2')
// )
// console.log(
//   'countFromIndex ',
//   await (await database).countFromIndex('articles', 'title')
// )

// export async function get(key) {
//   return (await (await database)).get('keyval', key);
// },
// export async function set(key, val) {
//   return (await database).put('keyval', val, key);
// },
// export async function del(key) {
//   return (await database).delete('keyval', key);
// },
// export async function clear() {
//   return (await database).clear('keyval');
// },
// export async function keys() {
//   return (await database).getAllKeys('keyval');
// },

// // // Add an article:
// await (
//   await database
// ).add('articles', {
//   title: 'Article 1',
//   date: new Date('2019-01-01'),
//   body: '…',
// })

// // Add multiple articles in one transaction:
// {
//   const tx = await (await database).transaction('articles', 'readwrite')
//   await Promise.all([
//     tx.store.add({
//       title: 'Article 2',
//       date: new Date('2019-01-01'),
//       body: '…',
//     }),
//     tx.store.add({
//       title: 'Article 3',
//       date: new Date('2019-01-02'),
//       body: '…',
//     }),
//     tx.done,
//   ])
// }

// Get all the articles in date order:

// const dbPromise = openDB('keyval-store', 1, {
//   upgrade(db) {
//     db.createObjectStore('keyval');
//   },
// });

// export async function get(key) {
//   return (await dbPromise).get('keyval', key);
// },
// export async function set(key, val) {
//   return (await dbPromise).put('keyval', val, key);
// },
// export async function del(key) {
//   return (await dbPromise).delete('keyval', key);
// },
// export async function clear() {
//   return (await dbPromise).clear('keyval');
// },
// export async function keys() {
//   return (await dbPromise).getAllKeys('keyval');
// },
//
window.addEventListener('unhandledrejection', (event) => {
  let request = event.target // IndexedDB native request object
  let error = event.reason //  Unhandled error object, same as request.error
  console.log('error by ', request)
  console.error(error)
  // ...report about the error...
})
