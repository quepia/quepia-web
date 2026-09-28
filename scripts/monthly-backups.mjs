import 'dotenv/config'
import { config } from 'dotenv'
import { projectModule } from './lib/load-project-module.mjs'
config({ path: '.env.local', quiet: true })
const {
  discoverMonthlyBackups,
  getMonthlyBackupOverview,
  processMonthlyBackups,
} = projectModule('lib/sistema/monthly-backups.ts')
const execute = process.argv.includes('--execute')
const all = process.argv.includes('--all')
let interrupted = false
process.on('SIGINT', () => {
  interrupted = true
})
process.on('SIGTERM', () => {
  interrupted = true
})
let firstBatch = true
if (execute) {
  do {
    const result = await processMonthlyBackups({
      maxFiles: 100,
      retryErrors: firstBatch && process.argv.includes('--retry-errors'),
    })
    firstBatch = false
    console.log(JSON.stringify(result))
    if (
      result.busy ||
      result.created + result.failed + result.continued === 0 ||
      !all ||
      interrupted
    )
      break
  } while (true)
} else {
  await discoverMonthlyBackups()
}
const overview = await getMonthlyBackupOverview()
console.log(JSON.stringify(overview, null, 2))
if (overview.clients.some((c) => c.months.some((m) => m.failed || m.pending)))
  process.exitCode = execute ? 2 : 0
