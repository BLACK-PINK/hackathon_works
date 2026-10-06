// Supabase SQL 적용 스크립트 (service_role key 사용 - 개발용)
// 실행: node supabase/apply.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import ws from 'ws'

const PROJECT_URL = 'https://jmiyskrsmmwyhcsxmreb.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY 환경변수가 필요합니다')
  process.exit(1)
}

const supabase = createClient(PROJECT_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws }
})

// SQL을 세미콜론 기준으로 분리 (달러 인용 내부 세미콜론 제외)
function splitSQL(sql) {
  const statements = []
  let current = ''
  let inDollarQuote = false
  let dollarTag = ''
  let i = 0

  // 주석 제거 (-- 한 줄 주석)
  const lines = sql.split('\n').map(line => {
    const idx = line.indexOf('--')
    return idx >= 0 ? line.slice(0, idx) : line
  }).join('\n')

  while (i < lines.length) {
    if (!inDollarQuote) {
      const dollarMatch = lines.slice(i).match(/^\$([a-zA-Z_]*)\$/)
      if (dollarMatch) {
        dollarTag = dollarMatch[0]
        inDollarQuote = true
        current += dollarTag
        i += dollarTag.length
        continue
      }
    } else {
      if (lines.slice(i).startsWith(dollarTag)) {
        inDollarQuote = false
        current += dollarTag
        i += dollarTag.length
        continue
      }
    }

    const char = lines[i]
    if (!inDollarQuote && char === ';') {
      const stmt = current.trim()
      if (stmt.length > 5) statements.push(stmt)
      current = ''
    } else {
      current += char
    }
    i++
  }

  const last = current.trim()
  if (last.length > 5) statements.push(last)
  return statements
}

// fetch로 직접 SQL 실행
async function rawSQL(sql) {
  const res = await fetch(`${PROJECT_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql })
  })
  const text = await res.text()
  return { status: res.status, body: text }
}

// supabase-js rpc 방식
async function rpcSQL(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { sql })
  return { data, error }
}

async function applyStatements(sql, label) {
  console.log(`\n📋 ${label}`)
  const stmts = splitSQL(sql)
  console.log(`   → ${stmts.length}개 구문`)

  let ok = 0, skip = 0, fail = 0

  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i]
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 70)

    // exec_sql RPC로 실행
    const { data, error } = await supabase.rpc('exec_sql', { sql: stmt })

    if (!error) {
      if (data && data.error) {
        const ignoreCodes = ['42P07', '42710', '23505', '42P06', '42P16', '25P02']
        if (ignoreCodes.includes(data.code)) {
          console.log(`   ⚠️  [${i+1}] 이미존재(무시): ${preview}`)
          skip++
        } else {
          console.log(`   ❌ [${i+1}] DB오류 ${data.code}: ${data.error}`)
          console.log(`      SQL: ${preview}`)
          fail++
        }
      } else {
        ok++
        if (i % 10 === 0) process.stdout.write('.')
      }
    } else {
      // exec_sql 자체가 없는 경우 → 부트스트랩 필요
      if (error.code === 'PGRST202') {
        console.log(`   ❌ exec_sql 함수 없음. 먼저 부트스트랩을 실행하세요.`)
        return false
      }
      console.log(`\n   ❌ [${i+1}] RPC오류: ${error.message}`)
      console.log(`      SQL: ${preview}`)
      fail++
    }
  }

  console.log(`\n   ✅ 성공: ${ok} / 스킵: ${skip} / 실패: ${fail}`)
  return fail === 0
}

async function bootstrap() {
  // exec_sql 함수 자체를 직접 POST로 생성할 수 없으므로
  // Supabase의 pg_rest API 또는 auth.admin 방법 확인
  console.log('\n🔧 Bootstrap: exec_sql 헬퍼 함수 생성 시도...')

  // 방법 1: /rest/v1/ 에 직접 쿼리 (service_role)
  const endpoints = [
    `${PROJECT_URL}/rest/v1/rpc/exec_sql`,
    `${PROJECT_URL}/pg/query`,
    `${PROJECT_URL}/rest/v1/rpc/query`,
  ]

  for (const ep of endpoints) {
    const res = await fetch(ep, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ sql: 'SELECT 1 as test' })
    })
    const body = await res.text()
    console.log(`   ${ep.split('.co')[1]}: ${res.status} → ${body.slice(0, 80)}`)
    if (res.status === 200) return true
  }
  return false
}

async function main() {
  console.log('🚀 Chapter Works - Supabase 설정 시작')
  console.log(`   프로젝트: ${PROJECT_URL}\n`)

  // 현재 상태 확인
  const { data: users, error: usersErr } = await supabase.auth.admin.listUsers()
  if (!usersErr) {
    console.log(`✅ Auth Admin 연결 성공 (기존 유저: ${users.users.length}명)`)
  } else {
    console.log(`❌ Auth Admin 오류: ${usersErr.message}`)
    return
  }

  // bootstrap 시도
  await bootstrap()
}

main().catch(console.error)
