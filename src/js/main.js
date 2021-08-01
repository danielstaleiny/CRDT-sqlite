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

let qs = document.querySelector.bind(document)
let qsa = document.querySelectorAll.bind(document)

function clear() {
  id('root').innerHTML = ''
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

let _syncTimer = null
function backgroundSync(state) {
  _syncTimer = setInterval(() => {
    // Don't sync if an input is focused, otherwise if changes come in
    // we will clear the input (since everything is rerendered :))
    if (document.activeElement === document.body) {
      try {
        sync()
          .then(() => setOffline(false, state))
          .catch(console.log)
      } catch (e) {
        if (e.message === 'network-failure') {
          setOffline(true, state).catch(console.log)
        } else {
          console.log(e)
          throw e
        }
      }
    }
  }, 4000)
}

async function setOffline(flag, uiState) {
  if (flag !== uiState.offline) {
    // uiState.offline = flag
    setSyncingEnabled(!flag)
    return render({ offline: flag })
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

let uiState = {
  offline: false,
  editingTodo: null,
  isAddingType: false,
  isDeletingType: false,
}
async function render(state) {
  uiState = { ...uiState, ...state }
  try {
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
      const templateAddingType = id('render-adding-type')
      let elAddType =
        templateAddingType.content.firstElementChild.cloneNode(true)
      root.appendChild(elAddType)
    }

    if (isDeletingType) {
      const templateDelete = id('render-deleting-type')
      let elDeleteType =
        templateDelete.content.firstElementChild.cloneNode(true)

      elDeleteType.innerHTML = plc(elDeleteType.innerHTML, {
        deleteType: {
          todotypes: await renderTodoTypes({ className: 'selected' }),
          mergeinto: await renderTodoTypes({
            className: 'merge',
            showBlank: true,
          }),
        },
      })

      root.appendChild(elDeleteType)
    }

    addEventHandlers(uiState)
    restoreScroll()
    restoreActiveElement()
  } catch (err) {
    console.err(err)
  }
}

function addEventHandlers(uiState) {
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
      setOffline(false, uiState).then(() => backgroundSync(uiState))
    } else {
      setOffline(true, uiState).then(() => {
        clearInterval(_syncTimer)
      })
    }
  })

  id('btn-add-type').addEventListener('click', () => {
    render({ isAddingType: true })
  })

  id('btn-delete-type').addEventListener('click', () => {
    render({ isDeletingType: true })
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
          return { editingTodo: todo }
        })
        .then(render)
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

      update('todos', { id: uiState.editingTodo.id, name: value }).finally(
        async () => {
          await render({ editingTodo: null })
        }
      )
    })

    if (id('btn-edit-undelete')) {
      id('btn-edit-undelete').addEventListener('click', (e) => {
        let input = e.target.parentNode.querySelector('input')
        let value = input.value
        update('todos', { id: uiState.editingTodo.id, tombstone: 0 }).finally(
          async () => {
            await render({ editingTodo: null })
          }
        )
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
      }).finally(async () => {
        await render({ isAddingType: false })
      })
    })
  } else if (uiState.isDeletingType) {
    console.log(id('btn-edit-delete'))
    id('btn-edit-delete').addEventListener('click', (e) => {
      let modal = e.target.parentNode
      let selected = qs('select.selected').selectedOptions[0].value
      let merge = qs('select.merge').selectedOptions[0].value

      if (selected === merge) {
        alert('Cannot merge type into itself')
        return
      }

      deleteTodoType(selected, merge !== '' ? merge : null)
        .finally(async () => {
          await render({ isDeletingType: false })
        })
        .catch((e) => console.log('e222', e))
    })
  }

  let cancel = id('btn-edit-cancel')
  if (cancel) {
    cancel.addEventListener('click', () => {
      render({ editingTodo: null, isAddingType: false, isDeletingType: false })
    })
  }
}

render().catch(console.log)

let _syncMessageTimer = null

onSync(async (hasChanged) => {
  await render({})

  let message = id('up-to-date')
  message.style.transition = 'none'
  message.style.opacity = 1

  clearTimeout(_syncMessageTimer)
  _syncMessageTimer = setTimeout(() => {
    message.style.transition = 'opacity .7s'
    message.style.opacity = 0
  }, 1000)
})

sync()
  .then(async () => {
    if ((await getTodoTypes()).length === 0) {
      // Insert some default types
      await insertTodoType({ name: 'Personal', color: 'green' })
      await insertTodoType({ name: 'Work', color: 'blue' })
    }
  })
  .catch(console.log)
backgroundSync({})
