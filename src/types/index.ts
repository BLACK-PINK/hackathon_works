// ============================================
// Chapter Works - TypeScript Type Definitions
// ============================================

// ============================================
// ENUMS
// ============================================
export type UserRole = 'owner' | 'manager' | 'worker'

export type ProjectStatus = 'active' | 'completed' | 'paused' | 'cancelled'

export type VatType = 'included' | 'excluded' | 'none'

export type TaskStatus = 'todo' | 'done' | 'deferred'

export type WorkOrderStatus = 'unconfirmed' | 'in_progress' | 'completed' | 'on_hold'

export type WorkOrderPriority = 'low' | 'normal' | 'high' | 'urgent'

export type AsStatus = 'received' | 'in_progress' | 'completed' | 'cancelled'

export type TransactionCategory = 'REVENUE' | 'COGS' | 'SGA' | 'NON_OPERATING' | 'TAX' | 'SITE_EXPENSE'

export type TransactionType = 'income' | 'expense'

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other'

export type PaymentStatus = 'pending' | 'received' | 'overdue' | 'cancelled'

export type AttachmentRelatedType =
  | 'site_log'
  | 'daily_task'
  | 'as_record'
  | 'work_order'
  | 'project'
  | 'transaction'

// ============================================
// ENTITIES
// ============================================

export interface Company {
  id: string
  name: string
  business_number?: string
  phone?: string
  address?: string
  invite_code: string
  owner_id?: string
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  company_id?: string
  name: string
  phone?: string
  role: UserRole
  avatar_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined
  company?: Company
}

export interface Project {
  id: string
  company_id: string
  name: string
  address?: string
  access_code?: string
  status: ProjectStatus
  cover_image_url?: string
  contract_amount: number
  vat_type: VatType
  start_date?: string
  end_date?: string
  client_name?: string
  client_phone?: string
  description?: string
  created_by?: string
  created_at: string
  updated_at: string
  // Joined
  creator?: UserProfile
  attachments?: Attachment[]
}

export interface DailyTask {
  id: string
  company_id: string
  project_id?: string
  date: string
  title: string
  content?: string
  status: TaskStatus
  priority: WorkOrderPriority
  assigned_to?: string
  created_by: string
  completed_at?: string
  created_at: string
  updated_at: string
  // Joined
  project?: Pick<Project, 'id' | 'name'>
  assignee?: Pick<UserProfile, 'id' | 'name' | 'avatar_url'>
  creator?: Pick<UserProfile, 'id' | 'name' | 'avatar_url'>
}

export interface SiteLog {
  id: string
  company_id: string
  project_id: string
  date: string
  process?: string
  workers_count: number
  worker_names?: string
  work_content: string
  special_notes?: string
  weather?: string
  created_by: string
  created_at: string
  updated_at: string
  // Joined
  project?: Pick<Project, 'id' | 'name'>
  creator?: Pick<UserProfile, 'id' | 'name' | 'avatar_url'>
  attachments?: Attachment[]
}

export interface AsRecord {
  id: string
  company_id: string
  project_id?: string
  received_date: string
  completed_date?: string
  status: AsStatus
  content: string
  resolution?: string
  client_name?: string
  client_phone?: string
  assigned_to?: string
  created_by: string
  created_at: string
  updated_at: string
  // Joined
  project?: Pick<Project, 'id' | 'name'>
  assignee?: Pick<UserProfile, 'id' | 'name' | 'avatar_url'>
  creator?: Pick<UserProfile, 'id' | 'name' | 'avatar_url'>
}

export interface WorkOrder {
  id: string
  company_id: string
  project_id?: string
  title: string
  content?: string
  status: WorkOrderStatus
  priority: WorkOrderPriority
  assigned_to?: string
  created_by: string
  due_date?: string
  confirmed_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
  // Joined
  project?: Pick<Project, 'id' | 'name'>
  assignee?: Pick<UserProfile, 'id' | 'name' | 'avatar_url'>
  creator?: Pick<UserProfile, 'id' | 'name' | 'avatar_url'>
  comments?: WorkOrderComment[]
  comment_count?: number
}

export interface WorkOrderComment {
  id: string
  company_id: string
  work_order_id: string
  content: string
  created_by: string
  created_at: string
  updated_at: string
  // Joined
  creator?: Pick<UserProfile, 'id' | 'name' | 'avatar_url'>
}

export interface CashAccount {
  id: string
  company_id: string
  user_id: string
  name: string
  initial_balance: number
  current_balance: number
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined
  user?: Pick<UserProfile, 'id' | 'name' | 'avatar_url'>
}

export interface Transaction {
  id: string
  company_id: string
  project_id?: string
  cash_account_id?: string
  category: TransactionCategory
  sub_category?: string
  type: TransactionType
  amount: number
  description: string
  memo?: string
  transaction_date: string
  is_site_expense: boolean
  is_internal_transfer: boolean   // 내부 자금 이동 (시재→대표 등) - 손익 제외
  has_vat: boolean                // 부가세 발행 여부 (legacy)
  supply_amount: number           // 공급가 (부가세 제외)
  vat_amount: number              // 부가세 금액
  vat_type: 'issued' | 'not_issued'  // 부가세 발행 구분
  payment_method?: PaymentMethod
  is_voided: boolean
  void_reason?: string
  voided_at?: string
  voided_by?: string
  created_by: string
  created_at: string
  updated_at: string
  // Joined
  project?: Pick<Project, 'id' | 'name'>
  cash_account?: Pick<CashAccount, 'id' | 'name'>
  creator?: Pick<UserProfile, 'id' | 'name' | 'avatar_url'>
  voider?: Pick<UserProfile, 'id' | 'name'>
}

export interface Payment {
  id: string
  company_id: string
  project_id: string
  title: string
  amount: number
  scheduled_date: string
  received_date?: string
  status: PaymentStatus
  memo?: string
  created_by: string
  created_at: string
  updated_at: string
  // Joined
  project?: Pick<Project, 'id' | 'name'>
  creator?: Pick<UserProfile, 'id' | 'name'>
}

export interface Attachment {
  id: string
  company_id: string
  related_type: AttachmentRelatedType
  related_id: string
  file_url: string
  file_name: string
  file_size?: number
  file_type?: string
  uploaded_by: string
  created_at: string
  // Joined
  uploader?: Pick<UserProfile, 'id' | 'name'>
}

// ============================================
// FORM TYPES (입력 폼용)
// ============================================

export interface CreateProjectForm {
  name: string
  address?: string
  access_code?: string
  contract_amount?: number
  vat_type: VatType
  start_date?: string
  end_date?: string
  client_name?: string
  client_phone?: string
  description?: string
}

export interface CreateDailyTaskForm {
  project_id?: string
  date: string
  title: string
  content?: string
  status?: TaskStatus
  priority?: WorkOrderPriority
  assigned_to?: string
}

export interface CreateSiteLogForm {
  project_id: string
  date: string
  process?: string
  workers_count?: number
  worker_names?: string
  work_content: string
  special_notes?: string
  weather?: string
}

export interface CreateAsRecordForm {
  project_id?: string
  received_date: string
  content: string
  client_name?: string
  client_phone?: string
  assigned_to?: string
}

export interface CreateWorkOrderForm {
  project_id?: string
  title: string
  content?: string
  priority?: WorkOrderPriority
  assigned_to?: string
  due_date?: string
}

export interface CreateTransactionForm {
  project_id?: string
  cash_account_id?: string
  category: TransactionCategory
  sub_category?: string
  type: TransactionType
  amount: number
  description: string
  memo?: string
  transaction_date: string
  is_site_expense?: boolean
  is_internal_transfer?: boolean  // 내부 자금 이동 (시재→대표 등) - 손익 제외
  has_vat?: boolean               // 부가세 발행 여부 (legacy)
  supply_amount?: number          // 공급가 (부가세 제외)
  vat_amount?: number             // 부가세 금액
  vat_type?: 'issued' | 'not_issued'  // 부가세 발행 구분
  payment_method?: PaymentMethod
}

export interface CreatePaymentForm {
  project_id: string
  title: string
  amount: number
  scheduled_date: string
  memo?: string
}

// ============================================
// FINANCE SUMMARY TYPES
// ============================================

export interface FinanceSummary {
  revenue: number           // 매출 (REVENUE)
  cogs: number              // 매출원가 (COGS)
  gross_profit: number      // 매출총이익 = REVENUE - COGS
  sga: number               // 판매관리비 (SGA)
  operating_profit: number  // 영업이익 = 매출총이익 - SGA
  non_operating: number     // 영업외수익 (NON_OPERATING)
  tax: number               // 세금 (TAX)
  net_profit: number        // 세전이익 = 영업이익 + 영업외 - TAX
}

export interface ProjectProfitSummary {
  project_id: string
  project_name: string
  revenue: number       // 수입 (결제 완료액)
  expenses: number      // 지출 (현장 경비 합산)
  profit: number        // 예상이익
  profit_rate: number   // 이익률 (%)
}

export interface CashAccountSummary {
  user_id: string
  user_name: string
  initial_balance: number
  total_income: number
  total_expense: number
  current_balance: number
}

// ============================================
// AUTH TYPES
// ============================================

export interface SignUpForm {
  email: string
  password: string
  name: string
  phone?: string
}

export interface SignInForm {
  email: string
  password: string
}

export interface CreateCompanyForm {
  name: string
  business_number?: string
  phone?: string
  address?: string
}

export interface JoinCompanyForm {
  invite_code: string
  role: UserRole
}

// ============================================
// UI STATE TYPES
// ============================================

export interface TabItem {
  id: string
  label: string
  icon: string
  href: string
  badge?: number
}

export interface FilterState {
  keyword?: string
  start_date?: string
  end_date?: string
  project_id?: string
  created_by?: string
  category?: string
}

export type DateRange = {
  start: string
  end: string
}

export type PeriodType = 'day' | 'week' | 'month' | 'quarter' | 'year'

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  per_page: number
}

// ============================================
// CATEGORY LABELS (한글)
// ============================================

export const TRANSACTION_CATEGORY_LABELS: Record<TransactionCategory, string> = {
  REVENUE: '매출',
  COGS: '매출원가',
  SGA: '판매관리비',
  NON_OPERATING: '영업외',
  TAX: '세금',
  SITE_EXPENSE: '현장경비',
}

export const TRANSACTION_SUB_CATEGORIES: Record<TransactionCategory, string[]> = {
  REVENUE: ['공사 대금', '추가 공사', '기타 매출'],
  COGS: ['시재지급', '자재비', '외주 인건비', '시공비', '장비 렌탈', '폐기물 처리', '기타 원가'],
  SGA: ['급여', '4대보험', '차량유지비', '사무용품', '통신비', '광고비', '기타 판관비'],
  SITE_EXPENSE: ['식음료', '간식비', '소모품', '교통비', '현장주유비', '기타 현장경비'],
  NON_OPERATING: ['이자수입', '잡수입', '기타 영업외'],
  TAX: ['부가세', '소득세', '법인세', '기타 세금'],
}

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  unconfirmed: '미확인',
  in_progress: '진행중',
  completed: '완료',
  on_hold: '보류',
}

export const WORK_ORDER_PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  low: '낮음',
  normal: '보통',
  high: '높음',
  urgent: '긴급',
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: '진행중',
  completed: '완료',
  paused: '일시중단',
  cancelled: '취소',
}

export const AS_STATUS_LABELS: Record<AsStatus, string> = {
  received: '접수',
  in_progress: '처리중',
  completed: '완료',
  cancelled: '취소',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: '대표',
  manager: '팀장',
  worker: '기사',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: '현금',
  card: '카드',
  transfer: '계좌이체',
  other: '기타',
}

// ============================================
// RECURRING EXPENSES (정기지출 템플릿)
// ============================================

export type RecurringExpenseType = 'fixed' | 'variable'

export interface RecurringExpense {
  id: string
  company_id: string
  name: string                         // 항목명 (예: 임차료, 유류비)
  expense_type: RecurringExpenseType   // 'fixed' | 'variable'
  sub_category?: string                // SGA 세부분류 매핑
  amount: number                       // 고정비: 월 금액, 변동비: 0
  billing_day?: number                 // 고정비: 매월 N일
  is_active: boolean
  memo?: string
  created_by: string
  created_at: string
  updated_at: string
}

// 변동비 항목 목록 (미리 정의)
export const VARIABLE_EXPENSE_ITEMS = [
  '유류비',
  '회식비',
  '직원 인센티브',
  '소모품',
  '접대비',
  '식대지출',
  '사업자 대출이자지급',
  '사무실 관리비',
  '교육비',
  '교통비',
  '숙소비',
  '출장비',
] as const

export type VariableExpenseItem = typeof VARIABLE_EXPENSE_ITEMS[number]
