import {
  onSync,
  sync,
  setSyncingEnabled,
  receiveMessages,
  sendMessages,
} from './sync.js'

import {
  update,
  insert,
  delete_,
  insertTodoType,
  getTodos,
  getDeletedTodos,
  getAllTodos,
  getNumTodos,
  getTodoTypes,
  deleteTodoType,
} from './dbindexdb.js'

import { dot, id } from './dom.js'
import { placeholders as plc } from './template.js'

// const container = document.getElementById('test-id')

// container.innerHTML = placeholders(template.innerHTML, data)
// // // or
// // const el = template.content.firstElementChild.cloneNode(true)
// // el.innerHTML = placeholders(el.innerHTML, data)
// // container.appendChild(el)
//

let qs = document.querySelector.bind(document)
let qsa = document.querySelectorAll.bind(document)

function clear() {
  id('root').innerHTML = ''
}

function append(str, root = id('root')) {
  let tpl = document.createElement('template')
  tpl.innerHTML = str
  root.appendChild(tpl.content)
}

function sanitize(string) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  }
  const reg = /[&<>"'/]/gi
  return string.replace(reg, (match) => map[match])
}

function getColor(name) {
  switch (name) {
    case 'green':
      return ' bg-green-300'
    case 'blue':
      return ' bg-blue-300'
    case 'red':
      return ' bg-red-300'
    case 'orange':
      return ' bg-orange-300'
    case 'yellow':
      return ' bg-yellow-300'
    case 'teal':
      return ' bg-teal-300'
    case 'purple':
      return ' bg-purple-300'
    case 'pink':
      return ' bg-pink-300'
  }
  return ' bg-gray-100'
}

let uiState = {
  offline: false,
  editingTodo: null,
  isAddingType: false,
  isDeletingType: false,
}

let _syncTimer = null
async function backgroundSync() {
  _syncTimer = setInterval(async () => {
    // Don't sync if an input is focused, otherwise if changes come in
    // we will clear the input (since everything is rerendered :))
    if (document.activeElement === document.body) {
      try {
        await sync()
        await setOffline(false)
      } catch (e) {
        if (e.message === 'network-failure') {
          await setOffline(true)
        } else {
          throw e
        }
      }
    }
  }, 4000)
}

async function setOffline(flag) {
  if (flag !== uiState.offline) {
    uiState.offline = flag
    setSyncingEnabled(!flag)
    await renderRoot()
  }
}

let _scrollTop = 0
function saveScroll() {
  let scroller = id('scroller')
  if (scroller) {
    _scrollTop = scroller.scrollTop
  }
}

function restoreScroll() {
  let scroller = id('scroller')
  if (scroller) {
    scroller.scrollTop = _scrollTop
  }
}

let _activeElement = null
function saveActiveElement() {
  let el = document.activeElement
  _activeElement = el.id
    ? '#' + el.id
    : el.className
    ? '.' + el.className.replace(/ ?hover\:[^ ]*/g, '').replace(/ /g, '.')
    : null
}

function restoreActiveElement() {
  if (_activeElement) {
    let elements = qsa(_activeElement)
    // Cheap focus management: only re-focus if there's a single
    // element, otherwise we don't know which one was focused
    if (elements.length === 1) {
      elements[0].focus()
    }
  }
}

async function renderTodoTypes({ className = '', showBlank } = {}) {
  return `
    <select class="${className} mr-2 bg-transparent shadow border border-gray-300">
      ${showBlank ? '<option value=""></option>' : ''}
      ${(await getTodoTypes()).map(
        (type) => `<option value="${type.id}">${type.name}</option>`
      )}
    </select>
  `
}

function renderTodos({ root, todos, isDeleted = false }) {
  const template = id('render-todos')

  todos.forEach((todo) => {
    let el = template.content.firstElementChild.cloneNode(true)
    el.innerHTML = plc(el.innerHTML, {
      todo: {
        id: todo.id,
        isDeleted: isDeleted ? 'line-through' : '',
        name: sanitize(todo.name),
        type: {
          color: todo.type ? getColor(todo.type.color) : '',
          name: todo.type ? sanitize(todo.type.name) : '',
        },
        isDeletedBtn: isDeleted ? ' hidden' : '',
      },
    })
    root.appendChild(el)
  })
}

async function renderRoot() {
  document.documentElement.style.height = '100%'
  document.body.style.height = '100%'

  saveScroll()
  saveActiveElement()

  let root = id('root')
  root.style.height = '100%'

  let { offline, editingTodo, isAddingType, isDeletingType } = uiState

  const template = id('render-root')

  root.innerHTML = plc(template.innerHTML, {
    types: await renderTodoTypes(),
    offlineBtnSync: offline ? 'bg-red-600' : 'bg-blue-600',
    offline: offline ? '(offline)' : '',
    offlineBtnSimulate: offline ? 'text-blue-700' : 'text-red-700',
    simulate: offline ? 'Go online' : 'Simulate offline',
  })

  renderTodos({ root: id('todos'), todos: await getTodos() })
  renderTodos({
    root: id('deleted-todos'),
    todos: await getDeletedTodos(),
    isDeleted: true,
  })

  console.log('editingTodo ', editingTodo)
  if (editingTodo) {
    const templateEditingTodo = id('render-editing-todo')

    let elEdit = templateEditingTodo.content.firstElementChild.cloneNode(true)
    elEdit.innerHTML = plc(elEdit.innerHTML, {
      editingTodo: {
        name: sanitize(editingTodo.name),
        undelete:
          editingTodo.tombstone === 1
            ? '<button id="btn-edit-undelete" class="pt-4 text-sm">Undelete</button>'
            : '',
      },
    })
    root.appendChild(elEdit)
  }

  if (isAddingType) {
    append(`
      <div class="absolute bottom-0 left-0 right-0 top-0 flex items-center justify-center" style="background-color: rgba(.2, .2, .2, .4)">
        <div class="bg-white p-8" style="width: 500px">
          <h2 class="text-lg font-bold mb-4">Add todo type</h2>
          <div class="flex">
            <input placeholder="Name..." autofocus class="shadow border border-gray-300 mr-2 flex-grow p-2 rounded" />
            <button id="btn-edit-save" class="rounded p-2 bg-blue-600 text-white mr-2">Save</button>
            <button id="btn-edit-cancel" class="rounded p-2 bg-gray-200">Cancel</button>
          </div>
        </div>
      </div>
    `)
  }

  if (isDeletingType) {
    append(`
      <div class="absolute bottom-0 left-0 right-0 top-0 flex items-center justify-center" style="background-color: rgba(.2, .2, .2, .4)">
        <div class="bg-white p-8" style="width: 500px">
          <h2 class="text-lg font-bold mb-4">Delete todo type</h2>
          <div class="pb-2">
            Delete ${await renderTodoTypes({ className: 'selected' })} and
            merge into ${await renderTodoTypes({
              className: 'merge',
              showBlank: true,
            })}
          </div>

          <div class="flex mt-2">
            <button id="btn-edit-delete" class="rounded p-2 bg-red-600 text-white mr-2">Delete</button>
            <button id="btn-edit-cancel" class="rounded p-2 bg-gray-200">Cancel</button>
          </div>
        </div>
      </div>
    `)
  }

  addEventHandlers()
  restoreScroll()
  restoreActiveElement()
}

async function addEventHandlers() {
  id('add-form').addEventListener('submit', (e) => {
    e.preventDefault()
    let [nameNode, typeNode] = e.target.elements
    let name = nameNode.value
    let type = typeNode.selectedOptions[0].value

    nameNode.value = ''
    typeNode.selectedIndex = 0

    if (name === '') {
      alert("Todo can't be blank. C'mon!")
      return
    }

    getNumTodos().then((numTodos) => {
      insert('todos', { name, type, order: numTodos })
    })
  })

  id('btn-sync').addEventListener('click', (e) => {
    sync()
  })

  id('btn-offline-simulate').addEventListener('click', () => {
    if (uiState.offline) {
      setOffline(false).then(backgroundSync)
    } else {
      setOffline(true).then(() => {
        clearInterval(_syncTimer)
      })
    }
  })

  id('btn-add-type').addEventListener('click', () => {
    uiState.isAddingType = true
    renderRoot()
  })

  id('btn-delete-type').addEventListener('click', () => {
    uiState.isDeletingType = true
    renderRoot()
  })

  for (let todoNode of dot('todo-item')) {
    todoNode.addEventListener('click', (e) => {
      getTodos()
        .then(async (todos) => {
          let todo = todos.find((t) => t.id === todoNode.dataset.id)
          if (!todo) {
            // Search the deleted todos (this could be large, so only
            // searching the existing todos first which is the common case
            // is faster
            todo = (await getAllTodos()).find(
              (t) => t.id === todoNode.dataset.id
            )
          }

          uiState.editingTodo = todo
        })
        .then(renderRoot)
    })
  }

  for (let btn of dot('btn-delete')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      delete_('todos', e.target.dataset.id)
    })
  }

  if (uiState.editingTodo) {
    id('btn-edit-save').addEventListener('click', (e) => {
      let input = e.target.parentNode.querySelector('input')
      let value = input.value

      update('todos', { id: uiState.editingTodo.id, name: value })
        .then(() => {
          uiState.editingTodo = null
        })
        .then(renderRoot)
    })

    if (id('btn-edit-undelete')) {
      id('btn-edit-undelete').addEventListener('click', (e) => {
        let input = e.target.parentNode.querySelector('input')
        let value = input.value

        update('todos', { id: uiState.editingTodo.id, tombstone: 0 })
          .then(() => {
            uiState.editingTodo = null
          })
          .then(renderRoot)
      })
    }
  } else if (uiState.isAddingType) {
    id('btn-edit-save').addEventListener('click', (e) => {
      let input = e.target.parentNode.querySelector('input')
      let value = input.value

      let colors = [
        'green',
        'blue',
        'red',
        'orange',
        'yellow',
        'teal',
        'purple',
        'pink',
      ]

      insertTodoType({
        name: value,
        color: colors[(Math.random() * colors.length) | 0],
      })
        .then(() => {
          uiState.isAddingType = false
        })
        .then(renderRoot)
    })
  } else if (uiState.isDeletingType) {
    id('btn-edit-delete').addEventListener('click', (e) => {
      let modal = e.target.parentNode
      let selected = qs('select.selected').selectedOptions[0].value
      let merge = qs('select.merge').selectedOptions[0].value

      if (selected === merge) {
        alert('Cannot merge type into itself')
        return
      }

      deleteTodoType(selected, merge !== '' ? merge : null)
        .catch((e) => console.log('e222', e))
        .then(() => {
          uiState.isDeletingType = false
        })
        .then(renderRoot)
    })
  }

  let cancel = id('btn-edit-cancel')
  if (cancel) {
    cancel.addEventListener('click', () => {
      uiState.editingTodo = null
      uiState.isAddingType = false
      uiState.isDeletingType = false
      renderRoot()
    })
  }
}

await renderRoot()

let _syncMessageTimer = null

onSync(async (hasChanged) => {
  await renderRoot()

  let message = id('up-to-date')
  message.style.transition = 'none'
  message.style.opacity = 1

  clearTimeout(_syncMessageTimer)
  _syncMessageTimer = setTimeout(() => {
    message.style.transition = 'opacity .7s'
    message.style.opacity = 0
  }, 1000)
})

sync().then(async () => {
  if ((await getTodoTypes()).length === 0) {
    // Insert some default types
    await insertTodoType({ name: 'Personal', color: 'green' })
    await insertTodoType({ name: 'Work', color: 'blue' })
  }
})
backgroundSync()
