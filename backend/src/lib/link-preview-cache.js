const MAX = 250;
const store = new Map();

function get(key) {
  const e = store.get(key);
  if (!e) return null;
  store.delete(key);
  store.set(key, e);
  return e;
}

function set(key, value) {
  if (store.has(key)) store.delete(key);
  store.set(key, value);
  while (store.size > MAX) {
    const first = store.keys().next().value;
    store.delete(first);
  }
}

module.exports = { get, set };
