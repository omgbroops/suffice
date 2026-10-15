const workerpool = require('./src/index.js')

const main = async () => {
  const now = new workerpool.Promise((resolve) => resolve(7))
  console.log('now settled with', await now.finally(() => console.log('now: finally callback ran')))

  const later = new workerpool.Promise((resolve) => setTimeout(() => resolve(42), 10))
  const value = await later.finally(() => console.log('later: finally callback ran'))
  console.log('later settled with', value)
}

main()
