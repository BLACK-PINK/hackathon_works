/**
 * Chapter Works - Supabase 완전 자동 설정 스크립트
 * 실행: SUPABASE_SERVICE_KEY=xxx node scripts/setup-supabase.mjs
 *
 * 보안: service_role key는 환경변수로만 주입, 코드에 저장 안 함
 */

const PROJECT_REF = "jmiyskrsmmwyhcsxmreb";
const BASE_URL    = `https://${PROJECT_REF}.supabase.co`;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_KEY 환경변수 없음");
  process.exit(1);
}

const HEADERS = {
  "apikey": SERVICE_KEY,
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: HEADERS,
    ...opts,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, data: json };
}

async function rpc(fn, params = {}) {
  return api(`/rest/v1/rpc/${fn}`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

async function insert(table, rows, upsert = false) {
  return api(`/rest/v1/${table}`, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Prefer": upsert
        ? "resolution=merge-duplicates,return=representation"
        : "return=representation",
    },
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
}

async function select(table, query = "") {
  return api(`/rest/v1/${table}?${query}`);
}

function ok(label, res) {
  if (res.ok) {
    console.log(`  ✅ ${label}`);
    return true;
  } else {
    const msg = typeof res.data === "object"
      ? res.data?.message || res.data?.hint || JSON.stringify(res.data).slice(0, 120)
      : String(res.data).slice(0, 120);
    console.log(`  ⚠️  ${label} → ${res.status}: ${msg}`);
    return false;
  }
}

// ─── Auth Admin: 유저 생성 ──────────────────────────────────────────────────

async function createAuthUser(email, password, name) {
  // 먼저 존재 여부 확인
  const listRes = await api(`/auth/v1/admin/users?per_page=1000`);
  const existing = listRes.data?.users?.find(u => u.email === email);
  if (existing) {
    console.log(`  ↩️  ${email} 이미 존재 (id: ${existing.id})`);
    return existing.id;
  }

  const res = await api("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    }),
  });

  if (res.ok) {
    console.log(`  ✅ 유저 생성: ${email} (id: ${res.data.id})`);
    return res.data.id;
  } else {
    console.error(`  ❌ 유저 생성 실패 (${email}):`, JSON.stringify(res.data).slice(0, 200));
    return null;
  }
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Chapter Works — Supabase 자동 설정 시작\n");

  // ── 0. 연결 확인 ──
  console.log("[ 0 ] 연결 확인");
  const authCheck = await api("/auth/v1/admin/users?per_page=1");
  if (!authCheck.ok) {
    console.error("❌ 연결 실패:", authCheck.data);
    process.exit(1);
  }
  console.log(`  ✅ 연결 성공 (기존 유저: ${authCheck.data.total ?? 0}명)\n`);

  // ── 1. exec_sql RPC 함수 존재 여부 확인 ──
  console.log("[ 1 ] exec_sql 함수 확인");
  const checkRpc = await rpc("exec_sql", { sql: "SELECT 1" });
  const hasRpc   = checkRpc.status !== 404;
  console.log(`  ${hasRpc ? "✅ exec_sql 존재" : "❌ exec_sql 없음 — SQL 직접 실행 불가"}\n`);

  if (!hasRpc) {
    console.log("━".repeat(60));
    console.log("⚠️  Supabase SQL Editor에서 아래 두 단계를 진행해주세요.");
    console.log("    URL: https://supabase.com/dashboard/project/jmiyskrsmmwyhcsxmreb/sql/new");
    console.log("━".repeat(60));
    console.log("\n[ STEP 1 ] 아래 SQL 실행 → exec_sql 함수 생성:\n");
    console.log(`CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS jsonb AS $$
BEGIN
  EXECUTE sql;
  RETURN '{"ok":true}'::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok',false,'error',SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`);

    console.log("\n[ STEP 2 ] 위 SQL 실행 후, 이 스크립트를 다시 실행하세요.");
    console.log("           그러면 스키마/RLS/데이터를 자동으로 적용합니다.\n");
    process.exit(0);
  }

  // ── 2. Schema 적용 ──
  console.log("[ 2 ] 스키마 적용 (테이블 + 트리거)");
  const { readFileSync } = await import("fs");
  const schemaSQL = readFileSync("./supabase/01_schema.sql", "utf8");

  // 큰 SQL을 $$ 블록 기준으로 분할해서 실행
  const stmts = splitStatements(schemaSQL);
  let schemaOk = 0, schemaFail = 0;
  for (const stmt of stmts) {
    if (!stmt.trim() || stmt.trim().startsWith("--")) continue;
    const r = await rpc("exec_sql", { sql: stmt });
    if (r.ok || (typeof r.data?.ok === "boolean" && r.data.ok)) {
      schemaOk++;
    } else {
      const errMsg = r.data?.error || JSON.stringify(r.data);
      if (errMsg.includes("already exists")) {
        schemaOk++; // 이미 있으면 OK
      } else {
        console.log(`  ⚠️  stmt 오류: ${errMsg.slice(0, 100)}`);
        schemaFail++;
      }
    }
  }
  console.log(`  ✅ Schema 완료: ${schemaOk}개 성공, ${schemaFail}개 오류\n`);

  // ── 3. RLS 적용 ──
  console.log("[ 3 ] RLS 정책 적용");
  const rlsSQL  = readFileSync("./supabase/02_rls.sql", "utf8");
  const rlsStmts = splitStatements(rlsSQL);
  let rlsOk = 0, rlsFail = 0;
  for (const stmt of rlsStmts) {
    if (!stmt.trim() || stmt.trim().startsWith("--")) continue;
    const r = await rpc("exec_sql", { sql: stmt });
    if (r.ok || (typeof r.data?.ok === "boolean" && r.data.ok)) {
      rlsOk++;
    } else {
      const errMsg = r.data?.error || JSON.stringify(r.data);
      if (errMsg.includes("already exists")) {
        rlsOk++;
      } else {
        console.log(`  ⚠️  RLS stmt 오류: ${errMsg.slice(0, 100)}`);
        rlsFail++;
      }
    }
  }
  console.log(`  ✅ RLS 완료: ${rlsOk}개 성공, ${rlsFail}개 오류\n`);

  // ── 4. 테스트 유저 생성 ──
  console.log("[ 4 ] 테스트 유저 생성");
  const ownerId   = await createAuthUser("owner@chapterworks.test",   "Test1234!", "김대표");
  const managerId = await createAuthUser("manager@chapterworks.test", "Test1234!", "이팀장");
  const workerId  = await createAuthUser("worker@chapterworks.test",  "Test1234!", "박기사");

  if (!ownerId || !managerId || !workerId) {
    console.error("❌ 유저 생성 실패, 중단합니다.");
    process.exit(1);
  }
  console.log();

  // ── 5. 회사 생성 ──
  console.log("[ 5 ] 회사 생성");
  // 기존 여부 확인
  let companyId;
  const existCo = await api(`/rest/v1/companies?name=eq.챕터웍스 인테리어&select=id`);
  if (existCo.ok && existCo.data?.length > 0) {
    companyId = existCo.data[0].id;
    console.log(`  ↩️  회사 이미 존재 (id: ${companyId})`);
  } else {
    const coRes = await rpc("exec_sql", {
      sql: `INSERT INTO companies (name, business_number, phone, address, invite_code, owner_id)
            VALUES ('챕터웍스 인테리어','123-45-67890','02-1234-5678',
                    '서울시 강남구 테헤란로 123','CWTEST01','${ownerId}')
            ON CONFLICT DO NOTHING
            RETURNING id`
    });
    // id 조회
    const idRes = await api(`/rest/v1/companies?name=eq.챕터웍스 인테리어&select=id`);
    companyId = idRes.data?.[0]?.id;
    console.log(`  ✅ 회사 생성 (id: ${companyId})`);
  }
  console.log();

  if (!companyId) {
    console.error("❌ company_id 없음, 중단합니다.");
    process.exit(1);
  }

  // ── 6. 유저 프로필 생성 ──
  console.log("[ 6 ] 유저 프로필 생성");
  const profiles = [
    { id: ownerId,   company_id: companyId, name: "김대표", phone: "010-1111-0001", role: "owner" },
    { id: managerId, company_id: companyId, name: "이팀장", phone: "010-2222-0002", role: "manager" },
    { id: workerId,  company_id: companyId, name: "박기사", phone: "010-3333-0003", role: "worker" },
  ];
  for (const p of profiles) {
    const r = await rpc("exec_sql", {
      sql: `INSERT INTO user_profiles (id, company_id, name, phone, role)
            VALUES ('${p.id}','${p.company_id}','${p.name}','${p.phone}','${p.role}')
            ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, name=EXCLUDED.name, role=EXCLUDED.role`
    });
    ok(`프로필: ${p.name}(${p.role})`, r.ok ? r : { ok: r.data?.ok !== false });
  }
  console.log();

  // ── 7. 현장(프로젝트) 생성 ──
  console.log("[ 7 ] 현장 생성");
  const projects = [
    {
      name: "강남 아파트 인테리어", address: "서울시 강남구 삼성동 101-1",
      status: "active", contract_amount: 85000000, vat_type: "excluded",
      start_date: "2025-04-01", end_date: "2025-06-30",
      client_name: "홍길동", client_phone: "010-9999-0001",
      description: "거실, 주방, 침실 2개 전체 리모델링", created_by: ownerId
    },
    {
      name: "송파 오피스텔 시공", address: "서울시 송파구 잠실동 200-5",
      status: "active", contract_amount: 42000000, vat_type: "included",
      start_date: "2025-05-01", end_date: "2025-05-31",
      client_name: "이순신", client_phone: "010-8888-0002",
      description: "원룸 풀옵션 인테리어", created_by: managerId
    },
    {
      name: "마포 카페 인테리어", address: "서울시 마포구 홍대입구 55-3",
      status: "completed", contract_amount: 120000000, vat_type: "excluded",
      start_date: "2025-02-01", end_date: "2025-03-31",
      client_name: "강감찬", client_phone: "010-7777-0003",
      description: "카페 내부 전체 인테리어 공사 완료", created_by: ownerId
    },
  ];

  const projIds = {};
  for (const p of projects) {
    // 기존 여부 확인
    const ex = await api(`/rest/v1/projects?name=eq.${encodeURIComponent(p.name)}&company_id=eq.${companyId}&select=id`);
    if (ex.ok && ex.data?.length > 0) {
      projIds[p.name] = ex.data[0].id;
      console.log(`  ↩️  현장 이미 존재: ${p.name}`);
      continue;
    }
    const r = await rpc("exec_sql", {
      sql: `INSERT INTO projects (company_id,name,address,status,contract_amount,vat_type,start_date,end_date,client_name,client_phone,description,created_by)
            VALUES ('${companyId}','${p.name}','${p.address}','${p.status}',${p.contract_amount},'${p.vat_type}',
                    '${p.start_date}','${p.end_date}','${p.client_name}','${p.client_phone}','${p.description}','${p.created_by}')
            RETURNING id`
    });
    const idRes = await api(`/rest/v1/projects?name=eq.${encodeURIComponent(p.name)}&company_id=eq.${companyId}&select=id`);
    projIds[p.name] = idRes.data?.[0]?.id;
    ok(`현장: ${p.name}`, { ok: !!projIds[p.name] });
  }

  const p1 = projIds["강남 아파트 인테리어"];
  const p2 = projIds["송파 오피스텔 시공"];
  const p3 = projIds["마포 카페 인테리어"];
  console.log();

  // ── 8. 업무일지 ──
  console.log("[ 8 ] 업무일지 생성");
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const tasks = [
    { project_id: p1, date: today,      title: "타일 시공 준비",     content: "욕실 타일 자재 입고 확인 및 배치",  status: "todo",     priority: "high",   assigned_to: workerId,   created_by: managerId },
    { project_id: p1, date: today,      title: "전기 배선 점검",     content: "조명 교체 전 기존 배선 상태 확인", status: "todo",     priority: "normal", assigned_to: workerId,   created_by: managerId },
    { project_id: p1, date: yesterday,  title: "도배 완료 보고",     content: "거실 도배 작업 완료 / 하자 없음",  status: "done",     priority: "normal", assigned_to: workerId,   created_by: workerId  },
    { project_id: p2, date: today,      title: "창호 설치 일정 조율", content: "창호 업체와 설치 날짜 협의",       status: "todo",     priority: "high",   assigned_to: managerId, created_by: managerId },
    { project_id: null, date: today,    title: "자재 발주 확인",     content: "다음 주 현장 자재 발주 리스트 검토", status: "todo",    priority: "normal", assigned_to: managerId, created_by: ownerId   },
  ];
  for (const t of tasks) {
    const projSql = t.project_id ? `'${t.project_id}'` : "NULL";
    const r = await rpc("exec_sql", {
      sql: `INSERT INTO daily_tasks (company_id,project_id,date,title,content,status,priority,assigned_to,created_by)
            VALUES ('${companyId}',${projSql},'${t.date}','${t.title}','${t.content}','${t.status}','${t.priority}','${t.assigned_to}','${t.created_by}')`
    });
    ok(t.title, r.ok ? r : { ok: r.data?.ok !== false });
  }
  console.log();

  // ── 9. 현장일지 ──
  console.log("[ 9 ] 현장일지 생성");
  const siteLogs = [
    { project_id: p1, date: today,     process: "철거", workers_count: 3, worker_names: "박기사, 최씨, 김씨", work_content: "거실 기존 바닥재 철거 완료. 하부 습기 발견.", special_notes: "하부 방습 처리 필요 — 자재 추가 발주 예정", weather: "맑음", created_by: workerId },
    { project_id: p1, date: yesterday, process: "목공", workers_count: 2, worker_names: "박기사, 이씨",       work_content: "주방 상부장 프레임 설치 완료.",            special_notes: null,                                     weather: "흐림", created_by: workerId },
    { project_id: p2, date: today,     process: "도배", workers_count: 2, worker_names: "박기사, 전씨",       work_content: "전 실 초배 완료, 정배 내일 예정.",          special_notes: null,                                     weather: "맑음", created_by: workerId },
  ];
  for (const s of siteLogs) {
    const notesSql = s.special_notes ? `'${s.special_notes}'` : "NULL";
    const r = await rpc("exec_sql", {
      sql: `INSERT INTO site_logs (company_id,project_id,date,process,workers_count,worker_names,work_content,special_notes,weather,created_by)
            VALUES ('${companyId}','${s.project_id}','${s.date}','${s.process}',${s.workers_count},'${s.worker_names}','${s.work_content}',${notesSql},'${s.weather}','${s.created_by}')`
    });
    ok(`현장일지: ${s.date} ${s.process}`, r.ok ? r : { ok: r.data?.ok !== false });
  }
  console.log();

  // ── 10. A/S 기록 ──
  console.log("[ 10 ] A/S 기록 생성");
  const day10ago = new Date(Date.now() - 10*86400000).toISOString().split("T")[0];
  const day5ago  = new Date(Date.now() -  5*86400000).toISOString().split("T")[0];
  const day2ago  = new Date(Date.now() -  2*86400000).toISOString().split("T")[0];
  const asRecords = [
    { project_id: p3, received_date: day10ago, completed_date: day5ago,  status: "completed",   content: "카운터 하부장 문짝 틀어짐",  resolution: "힌지 재조정 및 문짝 교체 완료", client_name: "강감찬", client_phone: "010-7777-0003", assigned_to: workerId,  created_by: managerId },
    { project_id: p1, received_date: day2ago,  completed_date: null,     status: "in_progress", content: "욕실 수전 누수 의심",         resolution: null,                            client_name: "홍길동", client_phone: "010-9999-0001", assigned_to: workerId,  created_by: managerId },
    { project_id: p2, received_date: today,    completed_date: null,     status: "received",    content: "현관 중문 잠금장치 불량",     resolution: null,                            client_name: "이순신", client_phone: "010-8888-0002", assigned_to: null,      created_by: managerId },
  ];
  for (const a of asRecords) {
    const cd   = a.completed_date ? `'${a.completed_date}'` : "NULL";
    const res  = a.resolution     ? `'${a.resolution}'`     : "NULL";
    const asgn = a.assigned_to    ? `'${a.assigned_to}'`    : "NULL";
    const r = await rpc("exec_sql", {
      sql: `INSERT INTO as_records (company_id,project_id,received_date,completed_date,status,content,resolution,client_name,client_phone,assigned_to,created_by)
            VALUES ('${companyId}','${a.project_id}','${a.received_date}',${cd},'${a.status}','${a.content}',${res},'${a.client_name}','${a.client_phone}',${asgn},'${a.created_by}')`
    });
    ok(`A/S: ${a.content.slice(0,20)}`, r.ok ? r : { ok: r.data?.ok !== false });
  }
  console.log();

  // ── 11. 업무지시 ──
  console.log("[ 11 ] 업무지시 생성");
  const day2later = new Date(Date.now() +  2*86400000).toISOString().split("T")[0];
  const day3later = new Date(Date.now() +  3*86400000).toISOString().split("T")[0];
  const day5later = new Date(Date.now() +  5*86400000).toISOString().split("T")[0];
  const day7later = new Date(Date.now() +  7*86400000).toISOString().split("T")[0];
  const orders = [
    { project_id: p1, title: "욕실 방습 처리 추가 시공",  content: "현장일지 확인 — 하부 습기 발견. 방습 필름 추가 시공 후 보고 바람.", status: "unconfirmed", priority: "urgent", assigned_to: workerId,  created_by: managerId, due_date: day2later },
    { project_id: p1, title: "주방 싱크대 설치 준비",     content: "싱크대 입고 일정 확인 후 설치 준비. 배관 위치 재확인 필수.",       status: "in_progress", priority: "high",   assigned_to: workerId,  created_by: managerId, due_date: day5later },
    { project_id: p2, title: "창호 설치 완료 후 사진 보고", content: "창호 설치 완료 시 현장 사진 3장 이상 첨부하여 보고.",            status: "unconfirmed", priority: "normal", assigned_to: workerId,  created_by: ownerId,   due_date: day7later },
    { project_id: null, title: "5월 자재비 정산 자료 제출", content: "이번 달 자재 구매 영수증 전체 정리 후 제출.",                    status: "unconfirmed", priority: "high",   assigned_to: managerId, created_by: ownerId,   due_date: day3later },
  ];
  for (const o of orders) {
    const pSql = o.project_id ? `'${o.project_id}'` : "NULL";
    const r = await rpc("exec_sql", {
      sql: `INSERT INTO work_orders (company_id,project_id,title,content,status,priority,assigned_to,created_by,due_date)
            VALUES ('${companyId}',${pSql},'${o.title}','${o.content}','${o.status}','${o.priority}','${o.assigned_to}','${o.created_by}','${o.due_date}')`
    });
    ok(`지시: ${o.title.slice(0,20)}`, r.ok ? r : { ok: r.data?.ok !== false });
  }
  console.log();

  // ── 12. 시재 계좌 ──
  console.log("[ 12 ] 시재 계좌 생성");
  const cashAccts = [
    { user_id: managerId, name: "이팀장 법인카드", initial_balance: 500000, current_balance: 320000 },
    { user_id: workerId,  name: "박기사 현금",     initial_balance: 200000, current_balance: 85000  },
  ];
  const acctIds = {};
  for (const a of cashAccts) {
    const ex = await api(`/rest/v1/cash_accounts?company_id=eq.${companyId}&user_id=eq.${a.user_id}&select=id`);
    if (ex.ok && ex.data?.length > 0) {
      acctIds[a.user_id] = ex.data[0].id;
      console.log(`  ↩️  시재 이미 존재: ${a.name}`);
      continue;
    }
    const r = await rpc("exec_sql", {
      sql: `INSERT INTO cash_accounts (company_id,user_id,name,initial_balance,current_balance)
            VALUES ('${companyId}','${a.user_id}','${a.name}',${a.initial_balance},${a.current_balance})
            ON CONFLICT (company_id,user_id) DO NOTHING RETURNING id`
    });
    const idRes = await api(`/rest/v1/cash_accounts?company_id=eq.${companyId}&user_id=eq.${a.user_id}&select=id`);
    acctIds[a.user_id] = idRes.data?.[0]?.id;
    ok(`시재: ${a.name}`, { ok: !!acctIds[a.user_id] });
  }
  const acctManager = acctIds[managerId];
  const acctWorker  = acctIds[workerId];
  console.log();

  // ── 13. 거래내역 ──
  console.log("[ 13 ] 거래내역 생성");
  const txns = [
    // 매출 (owner만)
    { project_id: p3, cash_account_id: null,        category: "REVENUE", sub_category: "공사대금", type: "income",  amount: 60000000, description: "마포 카페 1차 기성금",     memo: "계약금 50%",     txdate: "2025-02-15", is_site: false, method: "transfer", by: ownerId   },
    { project_id: p3, cash_account_id: null,        category: "REVENUE", sub_category: "공사대금", type: "income",  amount: 60000000, description: "마포 카페 2차 기성금",     memo: "잔금",           txdate: "2025-03-28", is_site: false, method: "transfer", by: ownerId   },
    { project_id: p1, cash_account_id: null,        category: "REVENUE", sub_category: "공사대금", type: "income",  amount: 42500000, description: "강남 아파트 계약금",       memo: "계약 50%",       txdate: "2025-04-01", is_site: false, method: "transfer", by: ownerId   },
    // 매출원가 (owner만)
    { project_id: p3, cash_account_id: null,        category: "COGS",    sub_category: "자재비",   type: "expense", amount: 35000000, description: "마포 카페 자재비 합계",   memo: null,             txdate: "2025-03-15", is_site: false, method: "transfer", by: ownerId   },
    { project_id: p1, cash_account_id: null,        category: "COGS",    sub_category: "자재비",   type: "expense", amount: 12000000, description: "강남 아파트 1차 자재비", memo: null,             txdate: "2025-04-10", is_site: false, method: "transfer", by: ownerId   },
    { project_id: p1, cash_account_id: null,        category: "COGS",    sub_category: "노무비",   type: "expense", amount:  8000000, description: "강남 아파트 4월 노무비", memo: "외주팀 지급",    txdate: "2025-04-30", is_site: false, method: "transfer", by: ownerId   },
    // 현장경비 (모두)
    { project_id: p1, cash_account_id: acctWorker,  category: "COGS",    sub_category: "현장경비", type: "expense", amount:    45000, description: "현장 점심식대",           memo: "4명",            txdate: today,        is_site: true,  method: "cash",     by: workerId  },
    { project_id: p1, cash_account_id: acctWorker,  category: "COGS",    sub_category: "현장경비", type: "expense", amount:    28000, description: "자재 운반 택시비",         memo: null,             txdate: today,        is_site: true,  method: "cash",     by: workerId  },
    { project_id: p2, cash_account_id: acctManager, category: "COGS",    sub_category: "현장경비", type: "expense", amount:    89000, description: "철물점 소모품 구매",       memo: "나사, 실리콘 등", txdate: yesterday,    is_site: true,  method: "card",     by: managerId },
    { project_id: p1, cash_account_id: acctManager, category: "COGS",    sub_category: "현장경비", type: "expense", amount:   120000, description: "현장 인부 식대(저녁)",    memo: "야근 특식",      txdate: yesterday,    is_site: true,  method: "cash",     by: managerId },
    // 판관비 (owner만)
    { project_id: null, cash_account_id: null,      category: "SGA",     sub_category: "사무용품", type: "expense", amount:    35000, description: "프린터 용지 구매",         memo: null,             txdate: day2ago,      is_site: false, method: "card",     by: ownerId   },
    { project_id: null, cash_account_id: null,      category: "SGA",     sub_category: "통신비",   type: "expense", amount:   110000, description: "4월 법인 휴대폰 요금",    memo: null,             txdate: "2025-04-25", is_site: false, method: "transfer", by: ownerId   },
  ];
  for (const t of txns) {
    const pSql  = t.project_id      ? `'${t.project_id}'`      : "NULL";
    const caSql = t.cash_account_id ? `'${t.cash_account_id}'` : "NULL";
    const mSql  = t.memo            ? `'${t.memo}'`            : "NULL";
    const r = await rpc("exec_sql", {
      sql: `INSERT INTO transactions (company_id,project_id,cash_account_id,category,sub_category,type,amount,description,memo,transaction_date,is_site_expense,payment_method,created_by)
            VALUES ('${companyId}',${pSql},${caSql},'${t.category}','${t.sub_category}','${t.type}',${t.amount},'${t.description}',${mSql},'${t.txdate}',${t.is_site},'${t.method}','${t.by}')`
    });
    ok(`거래: ${t.description.slice(0,18)}`, r.ok ? r : { ok: r.data?.ok !== false });
  }
  console.log();

  // ── 14. 결제 일정 ──
  console.log("[ 14 ] 결제 일정 생성");
  const day10later = new Date(Date.now() + 10*86400000).toISOString().split("T")[0];
  const day30later = new Date(Date.now() + 30*86400000).toISOString().split("T")[0];
  const day60later = new Date(Date.now() + 60*86400000).toISOString().split("T")[0];
  const pmts = [
    { project_id: p1, title: "강남 아파트 2차 기성금", amount: 42500000, scheduled_date: day30later, received_date: null,         status: "pending",  memo: "공정률 70% 달성 후" },
    { project_id: p1, title: "강남 아파트 잔금",       amount: 85000000, scheduled_date: day60later, received_date: null,         status: "pending",  memo: "준공 검사 후"       },
    { project_id: p2, title: "송파 오피스텔 계약금",   amount: 21000000, scheduled_date: "2025-05-01", received_date: "2025-05-01", status: "received", memo: null                },
    { project_id: p2, title: "송파 오피스텔 잔금",     amount: 21000000, scheduled_date: day10later, received_date: null,         status: "pending",  memo: null                },
    { project_id: p3, title: "마포 카페 최종 정산",    amount:  5000000, scheduled_date: "2025-04-15", received_date: null,         status: "overdue",  memo: "추가 공사 하자보수 보류" },
  ];
  for (const p of pmts) {
    const rdSql = p.received_date ? `'${p.received_date}'` : "NULL";
    const mSql  = p.memo          ? `'${p.memo}'`          : "NULL";
    const r = await rpc("exec_sql", {
      sql: `INSERT INTO payments (company_id,project_id,title,amount,scheduled_date,received_date,status,memo,created_by)
            VALUES ('${companyId}','${p.project_id}','${p.title}',${p.amount},'${p.scheduled_date}',${rdSql},'${p.status}',${mSql},'${ownerId}')`
    });
    ok(`결제: ${p.title.slice(0,18)}`, r.ok ? r : { ok: r.data?.ok !== false });
  }
  console.log();

  // ── 최종 확인 ──
  console.log("[ ✅ 완료 ] 최종 현황");
  const counts = {
    "user_profiles": "직원",
    "projects":      "현장",
    "daily_tasks":   "업무일지",
    "site_logs":     "현장일지",
    "as_records":    "A/S",
    "work_orders":   "업무지시",
    "transactions":  "거래내역",
    "payments":      "결제일정",
  };
  for (const [table, label] of Object.entries(counts)) {
    const r = await api(`/rest/v1/${table}?company_id=eq.${companyId}&select=id`, {
      headers: { ...HEADERS, "Prefer": "count=exact", "Range": "0-0" }
    });
    const count = r.data?.length ?? "?";
    console.log(`  ${label}: ${count}건`);
  }

  console.log("\n🎉 모든 설정 완료!\n");
  console.log("테스트 계정:");
  console.log("  대표  owner@chapterworks.test   / Test1234!");
  console.log("  팀장  manager@chapterworks.test / Test1234!");
  console.log("  기사  worker@chapterworks.test  / Test1234!");
}

// ─── SQL 분할 헬퍼 ──────────────────────────────────────────────────────────
function splitStatements(sql) {
  const stmts = [];
  let cur = "", depth = 0;
  const lines = sql.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("--")) { cur += line + "\n"; continue; }
    const dd = (line.match(/\$\$/g) || []).length;
    if (dd % 2 !== 0) depth = depth === 0 ? 1 : 0;
    cur += line + "\n";
    if (depth === 0 && t.endsWith(";")) {
      const s = cur.trim();
      if (s && s !== ";") stmts.push(s);
      cur = "";
    }
  }
  if (cur.trim()) stmts.push(cur.trim());
  return stmts.filter(s => s.length > 2 && !s.trim().startsWith("--") && !s.trim().startsWith("SELECT 'PART"));
}

main().catch(console.error);
