export function reportError(context, error) {
  const label = `[${context}]`
  if (error) {
    console.warn(label, error)
    return
  }
  console.warn(label)
}

