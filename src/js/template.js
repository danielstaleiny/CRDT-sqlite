/*!
 * Get an object value from a specific path
 * (c) 2018 Chris Ferdinandi, MIT License, https://gomakethings.com
 * @param  {Object}       obj  The object
 * @param  {String|Array} path The path
 * @param  {*}            def  A default value to return [optional]
 * @return {*}                 The value
 */
export const get = function (obj, path, def) {
  /**
   * If the path is a string, convert it to an array
   * @param  {String|Array} path The path
   * @return {Array}             The path array
   */
  var stringToPath = function (path) {
    // If the path isn't a string, return it
    if (typeof path !== 'string') return path

    // Create new array
    var output = []

    // Split to an array with dot notation
    path.split('.').forEach(function (item) {
      // Split to an array with bracket notation
      item.split(/\[([^}]+)\]/g).forEach(function (key) {
        // Push to the new array
        if (key.length > 0) {
          output.push(key)
        }
      })
    })

    return output
  }

  // Get the path as an array
  path = stringToPath(path)

  // Cache the current object
  var current = obj

  // For each item in the path, dig into the object
  for (var i = 0; i < path.length; i++) {
    // If the item isn't found, return the default (or null)
    if (!current[path[i]]) return def

    // Otherwise, update the current  value
    current = current[path[i]]
  }

  return current
}

//Requirements for this to work are this.
// no spaces around path eg. [[ spaced.obj ]]
// corrent one is [[without.space]]
// could not be in directly in first parent html element eg.
// <template><div class="[[this.will.not.work]]"><div/></template>
// in use case like this do this instead
// <template><div><div class="[[this.will.work]]"><div/><div/></template>
// we used dummy div to wrap. Reason for this is that we use innerHTML to add
// to parrent Element so it will not take these parameters if they are in parent element
// could not have multiple elements directly inside <template> tag
//
//
// INCORRECT, this returns DocumentFragment
// let el = template.content.cloneNode(true)
// CORRECT, this returns Element
// let el = template.content.firstElementChild.cloneNode(true)

/*!
 * Replaces placeholders with real content
 * Requires get() - https://vanillajstoolkit.com/helpers/get/
 * (c) 2019 Chris Ferdinandi, MIT License, https://gomakethings.com
 * @param {String} template The template string
 * @param {String} local    A local placeholder to use, if any
 */
export const placeholders = function (template, data) {
  'use strict'
  // Check if the template is a string or a function
  template = typeof template === 'function' ? template() : template
  if (['string', 'number'].indexOf(typeof template) === -1)
    throw 'PlaceholdersJS: please provide a valid template'

  // If no data, return template as-is
  if (!data) return template

  // Replace our curly braces with data
  template = template.replace(/\[\[([^\]]+)\]\]/g, function (match) {
    // Remove the wrapping curly braces
    match = match.slice(2, -2)

    // Get the value
    var val = get(data, match.trim(), '')

    // Replace
    if (val || val === '') return val
    else return '[[' + match + ']]'
  })

  return template
}
