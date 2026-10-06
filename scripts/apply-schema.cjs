// Chapter Works - Supabase Schema 적용 스크립트
// 사용법: node scripts/apply-schema.cjs
// service_role key는 이 파일에 저장하지 않음 - 환경변수로 주입

const { createClient } = require('../node_modules/@supabase/supabase-js/dist/index.cjs');

const SUPABASE_URL = 'https://jmiyskrsmmwyhcsxmreb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY 환경변수가 없습니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function runSQL(sql, label) {
  console.log(`\n⏳ ${label} 실행 중...`);
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    // exec_sql 함수가 없으면 다른 방법 시도
    return { ok: false, error };
  }
  console.log(`✅ ${label} 완료`);
  return { ok: true, data };
}

async function rawFetch(sql, label) {
  console.log(`\n⏳ ${label}...`);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql })
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, body: text };
  }
  console.log(`✅ ${label} 완료`);
  return { ok: true, body: text };
}

// --- SQL 분할 실행 헬퍼 ---
function splitStatements(sql) {
  // $$ 블록 안의 세미콜론은 분할하지 않도록 처리
  const stmts = [];
  let current = '';
  let inDollar = false;
  const lines = sql.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) { current += line + '\n'; continue; }
    if (trimmed.includes('$$')) {
      const count = (line.match(/\$\$/g) || []).length;
      if (count % 2 !== 0) inDollar = !inDollar;
    }
    current += line + '\n';
    if (!inDollar && trimmed.endsWith(';')) {
      const s = current.trim();
      if (s && s !== ';') stmts.push(s);
      current = '';
    }
  }
  if (current.trim()) stmts.push(current.trim());
  return stmts.filter(s => s.length > 2 && !s.startsWith('--'));
}

async function execViaPostgREST(sql, label) {
  // service_role key로 PostgREST를 통해 단일 SQL 실행
  // DB 함수 없이 직접 실행하는 유일한 방법: pg_dump endpoint
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql })
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

async function main() {
  console.log('🚀 Chapter Works - Supabase 스키마 적용 시작\n');
  console.log(`URL: ${SUPABASE_URL}`);

  // 1. 연결 테스트 (auth admin)
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
  });
  if (!authRes.ok) {
    console.error('❌ Supabase 연결 실패:', await authRes.text());
    process.exit(1);
  }
  const authData = await authRes.json();
  console.log(`✅ Supabase 연결 성공 (기존 유저: ${authData.total ?? 0}명)`);

  // 2. exec_sql 함수 존재 여부 확인
  const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql: 'SELECT 1' })
  });
  const hasExecSql = checkRes.status !== 404;
  console.log(`\nexec_sql 함수 존재: ${hasExecSql ? '✅ 예' : '❌ 없음 → Bootstrap 필요'}`);

  if (!hasExecSql) {
    console.log('\n⚠️  exec_sql 함수가 없습니다.');
    console.log('Supabase SQL Editor에서 아래 SQL을 먼저 실행해주세요:\n');
    console.log(`CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS jsonb AS $$
DECLARE result jsonb;
BEGIN
  EXECUTE sql;
  RETURN '{"ok":true}'::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`);
    process.exit(1);
  }

  // 3. 스키마 파일 읽기
  const fs = require('fs');
  const schemaSQL = fs.readFileSync('./supabase/01_schema.sql', 'utf8');
  const rlsSQL    = fs.readFileSync('./supabase/02_rls.sql', 'utf8');

  // 4. 실행
  for (const [label, sql] of [['Schema (테이블/트리거)', schemaSQL], ['RLS 정책', rlsSQL]]) {
    const r = await rawFetch(sql, label);
    if (!r.ok) {
      console.error(`❌ 오류: ${r.status}`, r.body.slice(0, 300));
    }
  }

  console.log('\n✅ 완료!');
}

main().catch(console.error);
