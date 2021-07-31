// Returns element
// id :: (String, Element) -> Element | Null
export const id = (searchForId, context) => {
  return (context || document).getElementById(searchForId)
}

// Returns copy of the found Elements
// (Array | String, Element) -> Array
export const dot = (searchForClass, context) => {
  // needs Array.from to change from live data to copy
  return Array.from(
    (context || document).getElementsByClassName(searchForClass)
  )
}
