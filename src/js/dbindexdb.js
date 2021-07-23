import { v4 as uuidv4 } from 'uuid'
import { setClock, getClock, makeClock, makeClientId } from './clock.js'
import { Timestamp, MutableTimestamp } from './timestamp.js'
import { openDB, deleteDB, wrap, unwrap } from 'idb'
import { _onSync, _syncEnabled, post } from './sync.js'
import * as merkle from './merkle.js'
import idbReady from 'safari-14-idb-fix'

Promise.each = async function (arr, fn) {
  // take an array and a function
  for (const item of arr) await fn(item)
}

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

      const storeTodos = db.createObjectStore('todos', {
        keyPath: 'id',
      })

      // storeTodos.createIndex('id', 'id', { unique: true })

      const storeTodoTypes = db.createObjectStore('todoTypes', {
        keyPath: 'id',
      })
      // storeTodoTypes.createIndex('id', 'id', { unique: true })

      const storeTodoTypeMapping = db.createObjectStore('todoTypeMapping', {
        keyPath: 'id',
      })
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

  // DONE
  async function apply(msg) {
    const row = await (await database).get(msg.dataset, msg.row)
    await (await database)
      .put(msg.dataset, { ...row, id: msg.row, [msg.column]: msg.value })
      .catch((e) => console.log('e8', e))
  }

  // DONE
  async function compareMessages(messages) {
    let existingMessages = new Map()

    let cursor = await (
      await database
    )
      .transaction('messages')
      .store.index('timestamp') // order by timestamp
      .openCursor(null, 'prev') // desc order !!

    let sortedMessages = []
    while (cursor) {
      sortedMessages.push(cursor.value)
      cursor = await cursor.continue()
    }

    // Most likely check to not duplicate same data which could come from user / server
    messages.forEach((msg1) => {
      // find finds first message matching the predicate
      let existingMsg = sortedMessages.find(
        (msg2) =>
          msg1.dataset === msg2.dataset &&
          msg1.row === msg2.row &&
          msg1.column === msg2.column
      )
      existingMessages.set(msg1, existingMsg)
    })
    //             key         value
    // could have object and undefined
    // or
    //            object and object
    return existingMessages
  }

  // DONE
  const applyM = async (messages) => {
    let existingMessages = await compareMessages(messages).catch((e) =>
      console.log('er3', e)
    )
    // console.log(existingMessages)
    // console.log(messages)
    let clock = getClock()

    await Promise.each(messages, async (msg) => {
      // console.log(msg)
      // console.log(existingMessages)
      let existingMsg = existingMessages.get(msg)

      // console.log(existingMsg)
      if (!existingMsg || existingMsg.timestamp < msg.timestamp) {
        await apply(msg).catch((e) => console.log('er2', e))
      }

      if (!existingMsg || existingMsg.timestamp !== msg.timestamp) {
        clock.merkle = merkle.insert(
          clock.merkle,
          Timestamp.parse(msg.timestamp)
        )

        // _messages.push(msg) // you can remove me
        return await (await database)
          .add('messages', msg)
          .catch((e) => console.log('er1', e))
      }
    })

    _onSync && _onSync()
    // // we call callback if there is any
  }

  await applyM(msgs)

  function receiveMessages(messages) {
    messages.forEach((msg) =>
      Timestamp.recv(getClock(), Timestamp.parse(msg.timestamp))
    )

    applyM(messages)
  }

  async function sync(initialMessages = [], since = null) {
    if (!_syncEnabled) {
      return
    }

    let messages = initialMessages

    if (since) {
      let timestamp = new Timestamp(since, 0, '0').toString()

      let cursor = await (
        await database
      )
        .transaction('messages')
        .store.index('timestamp') // order by timestamp
        .openCursor(null, 'prev') // desc order !!

      let messages = []
      while (cursor) {
        if (cursor.value.timestamp >= timestamp) messages.push(cursor.value)
        cursor = await cursor.continue()
      }

      // messages = _messages.filter((msg) => msg.timestamp >= timestamp)
    }

    let result
    try {
      result = await post({
        group_id: 'my-group',
        client_id: getClock().timestamp.node(),
        messages,
        merkle: getClock().merkle,
      })
    } catch (e) {
      throw new Error('network-failure')
    }

    if (result.messages.length > 0) {
      receiveMessages(result.messages)
    }

    let diffTime = merkle.diff(result.merkle, getClock().merkle)

    if (diffTime) {
      if (since && since === diffTime) {
        throw new Error(
          'A bug happened while syncing and the client ' +
            'was unable to get in sync with the server. ' +
            "This is an internal error that shouldn't happen"
        )
      }

      return sync([], diffTime)
    }
  }

  // await sync(msgs)

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
