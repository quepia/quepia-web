import fs from 'node:fs/promises'
import process from 'node:process'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local', quiet: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const tableSpecs = {
  accounting_client_payments: ['amount', 'currency'],
  accounting_expenses: ['amount', 'currency'],
  accounting_transfers: ['amount', 'currency'],
  accounting_partner_contributions: ['amount', 'currency'],
  accounting_contribution_repayments: ['amount'],
  accounting_balance_adjustments: ['adjustment_amount'],
}

async function fetchRows(table, columns) {
  const { data, error } = await db.from(table).select(columns.join(','))
  if (error) throw new Error(`${table}: ${error.message}`)
  return data || []
}

function sum(rows, column, currency) {
  return rows
    .filter(row => !currency || row.currency === currency)
    .reduce((total, row) => total + Number(row[column] || 0), 0)
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

async function buildSnapshot() {
  const entries = await Promise.all(
    Object.entries(tableSpecs).map(async ([table, columns]) => {
      const rows = await fetchRows(table, columns)
      const amountColumn = columns.includes('amount') ? 'amount' : 'adjustment_amount'
      const hasCurrency = columns.includes('currency')

      return [table, {
        count: rows.length,
        ...(hasCurrency
          ? {
              total_ars: round(sum(rows, amountColumn, 'ARS')),
              total_usd: round(sum(rows, amountColumn, 'USD')),
            }
          : { total: round(sum(rows, amountColumn)) }),
      }]
    })
  )

  return Object.fromEntries(entries)
}

function compareSnapshots(before, after) {
  const differences = []

  for (const [table, expected] of Object.entries(before)) {
    const actual = after[table]
    if (!actual) {
      differences.push(`${table}: missing from current snapshot`)
      continue
    }

    for (const [metric, expectedValue] of Object.entries(expected)) {
      if (actual[metric] !== expectedValue) {
        differences.push(`${table}.${metric}: expected ${expectedValue}, got ${actual[metric]}`)
      }
    }
  }

  return differences
}

const args = process.argv.slice(2)
const saveIndex = args.indexOf('--save')
const compareIndex = args.indexOf('--compare')
const snapshot = await buildSnapshot()

if (saveIndex >= 0) {
  const path = args[saveIndex + 1]
  if (!path) throw new Error('--save requires a file path')
  await fs.writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  console.log(`Accounting integrity baseline saved to ${path}`)
} else if (compareIndex >= 0) {
  const path = args[compareIndex + 1]
  if (!path) throw new Error('--compare requires a file path')
  const baseline = JSON.parse(await fs.readFile(path, 'utf8'))
  const differences = compareSnapshots(baseline, snapshot)

  if (differences.length > 0) {
    console.error('Accounting integrity verification failed:')
    for (const difference of differences) console.error(`- ${difference}`)
    process.exitCode = 1
  } else {
    console.log('Accounting integrity verification passed: historical counts and totals are unchanged.')
  }
} else {
  console.log(JSON.stringify(snapshot, null, 2))
}
