// T108 迁移/取消"任务"变体锁 task_name:指令大全的迁移 / 取消命令,任务变体让用户
// 从下拉选一条具体任务。旧行为只把方案名锁进 locked_slots,任务名被拍平进 text 走
// 后端 NLU —— 中文任务名欠抽取(T90 B2b)→ task_name 空 → 后端 phase-1 anchor 过滤
// (_match_tasks_for_phase1_anchor)短路 → 当天全表 14 条全命中(T107 Branch A 根因)。
//
// 修法(纯前端,复用 T99/T100 slot-lock):buildLockedDirective 里额外把选中的任务名
// 锁进 locked_slots.task_name。守卫:仅当 task 槽存在且选中值非空才锁 —— 日期变体
// (无 task 槽)不锁,保住"挪 / 取消当天全部"的正确行为。
//
// swap(schedule-swap)按日期对调、无任务槽,天然命不中本分支,不受影响。
// 单测验不了端到端(后端真按 task_name 收窄到 1 条 / 多条同名走消歧),需 PO 浏览器手测(KP #8)。
//
// T122:取消命令改成"按天 / 按时段"(删掉旧"按任务"变体)。两变体都无方案槽,语义 =
// 跨所有启用方案 + 当天定时的文件广播。锁 cancel_schedule + 结构化 time_range_start/end
// (格式 "YYYY-MM-DD HH:MM",对齐后端 _resolve_cancel_schedule_time_context 读的键),
// 不锁方案 / 任务。按天 = 整天 [00:00, 23:59];按时段 = anchor(今天/明天/后天)解析成
// 具体日期 + 起止时间。故本文件的 cancel 用例从"锁 task_name"改为"锁 time_range"。

import { shallowMount } from '@vue/test-utils'
import AiAssistantFloat from '@/components/AiAssistantFloat.vue'
import axios from 'axios'

jest.mock('axios', () => {
  const mockApi = {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
    interceptors: { request: { use: jest.fn() }}
  }
  return { get: jest.fn(), create: jest.fn(() => mockApi), __mockApi: mockApi }
})

const elementStubs = [
  'el-button', 'el-tooltip', 'el-drawer', 'el-input', 'el-tabs', 'el-tab-pane',
  'el-collapse', 'el-collapse-item', 'el-popover', 'el-select', 'el-option',
  'el-tag', 'el-input-number', 'el-date-picker', 'el-time-select', 'el-radio-group', 'el-radio-button'
]

function createWrapper() {
  return shallowMount(AiAssistantFloat, {
    stubs: elementStubs,
    mocks: {
      $message: { warning: jest.fn(), error: jest.fn(), success: jest.fn() },
      $notify: jest.fn(),
      $root: { $emit: jest.fn(), $on: jest.fn(), $off: jest.fn() }
    }
  })
}

const SCHEDULE_OPTIONS = [
  { label: '6.25cs', value: '6.25cs', status: '停用', displayLabel: '6.25cs' },
  { label: '春季作息', value: '春季作息', status: '启用', displayLabel: '春季作息 (启动)' }
]

// 从组件真实的 manualModules 里按 id 取 item(不自造,测真定义)。
function manualItem(vm, id) {
  const item = vm.manualModules
    .reduce((acc, mod) => acc.concat(mod.items || []), [])
    .find((it) => it.id === id)
  if (!item) throw new Error(`manual item not found: ${id}`)
  return item
}

function selectSlots(vm, itemId, selections) {
  vm.$set(vm.slotSelections, itemId, { ...selections })
}

describe('T108/T122 buildLockedDirective — migrate 锁 task_name / cancel 改按天·按时段锁 time_range', () => {
  let vm
  beforeEach(() => {
    vm = createWrapper().vm
    vm.slotOptions.schedule = SCHEDULE_OPTIONS
  })

  it('case1: migrate 任务变体 + 选方案 + 选任务 → slots 含 task_name + schedule_name', () => {
    const item = manualItem(vm, 'schedule-task-migrate')
    selectSlots(vm, 'schedule-task-migrate', {
      方案: '春季作息', 原日期: '2026-07-01', 任务: '第一节课上课铃', 目标日期: '2026-07-03'
    })
    const directive = vm.buildLockedDirective(item, 'x')
    expect(directive.intent).toBe('move_schedule')
    expect(directive.slots).toEqual({ schedule_name: '春季作息', task_name: '第一节课上课铃' })
  })

  it('case2: migrate 日期变体(无 task 槽)→ slots 不含 task_name(保当天全部)', () => {
    const item = manualItem(vm, 'schedule-task-migrate')
    vm.$set(vm.manualVariantState, 'schedule-task-migrate', 'date')
    // 即便残留了任务选择,日期变体 slotMap 无 task 槽 → getTaskSlotKey 命不中 → 不锁。
    selectSlots(vm, 'schedule-task-migrate', {
      方案: '春季作息', 原日期: '2026-07-01', 任务: '第一节课上课铃', 目标日期: '2026-07-03'
    })
    const directive = vm.buildLockedDirective(item, 'x')
    expect(directive.slots).toEqual({ schedule_name: '春季作息' })
    expect(directive.slots.task_name).toBeUndefined()
  })

  // T122: cancel 命令改成"按天 / 按时段"——无方案槽,跨所有启用方案 + 文件广播,
  // 锁 cancel_schedule + 结构化 time_range_start/end,不锁方案 / 任务。
  it('case3: cancel 按天单日 → cancel_schedule + 整天 time_range + enabled_all,不锁方案/任务', () => {
    const item = manualItem(vm, 'schedule-task-cancel')
    // 默认变体已是 date(按天)。
    selectSlots(vm, 'schedule-task-cancel', { 日期: '2026-07-01' })
    const directive = vm.buildLockedDirective(item, 'x')
    expect(directive.intent).toBe('cancel_schedule')
    // f1(BLOCKER):必须含 schedule_scope='enabled_all',否则 2+ 启用方案会掉
    // target_disambiguation / 当天有广播时静默只删广播丢作息任务。
    expect(directive.slots).toEqual({
      time_range_start: '2026-07-01 00:00',
      time_range_end: '2026-07-01 23:59',
      schedule_scope: 'enabled_all'
    })
    expect('schedule_name' in directive.slots).toBe(false)
    expect('task_name' in directive.slots).toBe(false)
  })

  it('case4: cancel 按天区间 → time_range 跨首末两天 + enabled_all', () => {
    const item = manualItem(vm, 'schedule-task-cancel')
    selectSlots(vm, 'schedule-task-cancel', { 日期: '2026-07-01到2026-07-05' })
    const directive = vm.buildLockedDirective(item, 'x')
    expect(directive.slots).toEqual({
      time_range_start: '2026-07-01 00:00',
      time_range_end: '2026-07-05 23:59',
      schedule_scope: 'enabled_all'
    })
  })

  it('case4b: cancel 按时段(anchor + 起止时间)→ 具体日期 + 时刻 time_range + enabled_all', () => {
    const item = manualItem(vm, 'schedule-task-cancel')
    vm.$set(vm.manualVariantState, 'schedule-task-cancel', 'timerange')
    // FE 端把相对锚点解析成具体日期,固定成 2026-07-02 便于断言(不依赖跑测当天)。
    jest.spyOn(vm, 'resolveStructuredAnchorDate').mockReturnValue('2026-07-02')
    vm.$set(vm.structuredTimeSelections, 'schedule-task-cancel:时段', {
      anchor: '今天', startTime: '14:00', endTime: '18:00'
    })
    const directive = vm.buildLockedDirective(item, 'x')
    expect(directive.intent).toBe('cancel_schedule')
    expect(directive.slots).toEqual({
      time_range_start: '2026-07-02 14:00',
      time_range_end: '2026-07-02 18:00',
      schedule_scope: 'enabled_all'
    })
    expect('schedule_name' in directive.slots).toBe(false)
  })

  it('case4c: cancel 按时段 起止时间未选全 → 不锁(退回 NLU)', () => {
    const item = manualItem(vm, 'schedule-task-cancel')
    vm.$set(vm.manualVariantState, 'schedule-task-cancel', 'timerange')
    vm.$set(vm.structuredTimeSelections, 'schedule-task-cancel:时段', {
      anchor: '今天', startTime: '14:00', endTime: ''
    })
    expect(vm.buildLockedDirective(item, 'x')).toBeNull()
  })

  it('case4d: cancel 按时段 结束<=开始 → 不锁(非法窗口)', () => {
    const item = manualItem(vm, 'schedule-task-cancel')
    vm.$set(vm.manualVariantState, 'schedule-task-cancel', 'timerange')
    jest.spyOn(vm, 'resolveStructuredAnchorDate').mockReturnValue('2026-07-02')
    vm.$set(vm.structuredTimeSelections, 'schedule-task-cancel:时段', {
      anchor: '今天', startTime: '18:00', endTime: '14:00'
    })
    expect(vm.buildLockedDirective(item, 'x')).toBeNull()
  })

  it('case4e: cancel 命令已无 "任务"(task)变体(T122 删除)', () => {
    const item = manualItem(vm, 'schedule-task-cancel')
    expect(item.variants.task).toBeUndefined()
    expect(Object.keys(item.variants).sort()).toEqual(['date', 'timerange'])
    expect(item.defaultVariant).toBe('date')
  })

  it('case5: 任务变体但任务未选 → 只锁 schedule_name(不塞空 task_name)', () => {
    const item = manualItem(vm, 'schedule-task-migrate')
    selectSlots(vm, 'schedule-task-migrate', { 方案: '春季作息', 原日期: '2026-07-01' })
    const directive = vm.buildLockedDirective(item, 'x')
    expect(directive.slots).toEqual({ schedule_name: '春季作息' })
    expect('task_name' in directive.slots).toBe(false)
  })

  it('case6: swap(无任务槽)→ 只锁 schedule_name,天然不锁 task_name', () => {
    const item = manualItem(vm, 'schedule-swap')
    selectSlots(vm, 'schedule-swap', { 方案: '春季作息', 原日期: '2026-07-01', 目标日期: '2026-07-03' })
    const directive = vm.buildLockedDirective(item, 'x')
    expect(directive.slots).toEqual({ schedule_name: '春季作息' })
  })

  // reverse-truth:证明 case1 的 task_name 确实由新分支(getSelectedTaskValue)锁进去。
  // 禁掉该分支(getSelectedTaskValue 恒返回 '')→ migrate 任务变体 task_name 缺席。
  it('[reverse-truth] 禁掉锁 task_name 分支 → migrate 任务变体 task_name 缺席', () => {
    jest.spyOn(vm, 'getSelectedTaskValue').mockReturnValue('')
    const migrate = manualItem(vm, 'schedule-task-migrate')
    selectSlots(vm, 'schedule-task-migrate', {
      方案: '春季作息', 原日期: '2026-07-01', 任务: '第一节课上课铃', 目标日期: '2026-07-03'
    })
    expect(vm.buildLockedDirective(migrate, 'x').slots).toEqual({ schedule_name: '春季作息' })
  })

  // T122 reverse-truth:证明 cancel 按天的 time_range 确实由 resolveCancelScopeLockedSlots
  // 锁进去。禁掉它(恒返回 null)→ cancel 按天不再锁 → 整个 directive = null。
  it('[reverse-truth] 禁掉 cancel 时段解析 → cancel 按天不锁(null)', () => {
    jest.spyOn(vm, 'resolveCancelScopeLockedSlots').mockReturnValue(null)
    const cancel = manualItem(vm, 'schedule-task-cancel')
    selectSlots(vm, 'schedule-task-cancel', { 日期: '2026-07-01' })
    expect(vm.buildLockedDirective(cancel, 'x')).toBeNull()
  })
})

describe('T108/T122 发送 body — migrate 带 task_name / cancel 按天·按时段带 time_range', () => {
  let vm
  beforeEach(() => {
    jest.clearAllMocks()
    axios.__mockApi.get.mockResolvedValue({ data: { schedules: [] }})
    axios.__mockApi.post.mockResolvedValue({
      data: { output_speech: 'ok', reply: 'ok', intent: 'noop', confidence: 1, missing_slots: [], diagnostics: [], action_log: [] }
    })
    vm = createWrapper().vm
    jest.spyOn(vm, 'fetchAssistantLogs').mockImplementation(() => Promise.resolve())
    vm.slotOptions.schedule = SCHEDULE_OPTIONS
  })

  function lastPostBody() {
    const calls = axios.__mockApi.post.mock.calls
    return calls[calls.length - 1][1]
  }

  it('migrate 任务变体填模板 → 发送 body.locked_slots 含 task_name + schedule_name', async() => {
    const item = manualItem(vm, 'schedule-task-migrate')
    selectSlots(vm, 'schedule-task-migrate', {
      方案: '春季作息', 原日期: '2026-07-01', 任务: '第一节课上课铃', 目标日期: '2026-07-03'
    })
    vm.fillFromTemplate(item)
    await vm.sendToAssistant()
    const body = lastPostBody()
    expect(body.locked_intent).toBe('move_schedule')
    expect(body.locked_slots).toEqual({ schedule_name: '春季作息', task_name: '第一节课上课铃' })
  })

  it('cancel 按天填模板 → 发送 body.locked_slots 含整天 time_range(无 schedule_name)', async() => {
    const item = manualItem(vm, 'schedule-task-cancel')
    selectSlots(vm, 'schedule-task-cancel', { 日期: '2026-07-01' })
    vm.fillFromTemplate(item)
    expect(vm.command).toBe('取消2026-07-01的任务')
    await vm.sendToAssistant()
    const body = lastPostBody()
    expect(body.locked_intent).toBe('cancel_schedule')
    expect(body.locked_slots).toEqual({
      time_range_start: '2026-07-01 00:00',
      time_range_end: '2026-07-01 23:59',
      schedule_scope: 'enabled_all'
    })
  })

  it('cancel 按时段填模板 → 发送 body.locked_slots 含具体日期时刻 time_range', async() => {
    const item = manualItem(vm, 'schedule-task-cancel')
    vm.$set(vm.manualVariantState, 'schedule-task-cancel', 'timerange')
    jest.spyOn(vm, 'resolveStructuredAnchorDate').mockReturnValue('2026-07-02')
    vm.$set(vm.structuredTimeSelections, 'schedule-task-cancel:时段', {
      anchor: '今天', startTime: '14:00', endTime: '18:00'
    })
    selectSlots(vm, 'schedule-task-cancel', { 时段: '今天14:00到18:00' })
    vm.fillFromTemplate(item)
    expect(vm.command).toBe('取消今天14:00到18:00的任务')
    await vm.sendToAssistant()
    const body = lastPostBody()
    expect(body.locked_intent).toBe('cancel_schedule')
    expect(body.locked_slots).toEqual({
      time_range_start: '2026-07-02 14:00',
      time_range_end: '2026-07-02 18:00',
      schedule_scope: 'enabled_all'
    })
  })
})

// T122:结构化时段选择器基建(复用自 structuredTimeRange,从"anchor + 自由文本 detail"
// 改成"anchor + 起止时间下拉",非自由打字)。这些 helper 供"按时段"变体拼锁值 + 回显。
describe('T122 结构化时段选择器基建 — anchor + 起止时间', () => {
  let vm
  beforeEach(() => {
    vm = createWrapper().vm
  })

  it('normalizeClockTime 校验 / 归一 HH:MM,非法返回空', () => {
    expect(vm.normalizeClockTime('9:05')).toBe('09:05') // 小时补零
    expect(vm.normalizeClockTime('14:00')).toBe('14:00')
    expect(vm.normalizeClockTime('9:5')).toBe('') // 分钟必须两位
    expect(vm.normalizeClockTime('24:00')).toBe('') // 小时越界
    expect(vm.normalizeClockTime('12:60')).toBe('') // 分钟越界
    expect(vm.normalizeClockTime('下午两点')).toBe('') // 非结构化文本
  })

  it('parseStructuredTimeValue 反解 "今天14:00到18:00"', () => {
    expect(vm.parseStructuredTimeValue('今天14:00到18:00')).toEqual({
      anchor: '今天', startTime: '14:00', endTime: '18:00'
    })
    expect(vm.parseStructuredTimeValue('')).toEqual({ anchor: '', startTime: '', endTime: '' })
  })

  it('formatStructuredTimeValue 三段齐才成句,缺一段为空', () => {
    const id = 'schedule-task-cancel'
    vm.$set(vm.structuredTimeSelections, `${id}:时段`, { anchor: '明天', startTime: '08:00', endTime: '09:00' })
    expect(vm.formatStructuredTimeValue(id, '时段')).toBe('明天08:00到09:00')
    vm.$set(vm.structuredTimeSelections, `${id}:时段`, { anchor: '明天', startTime: '08:00', endTime: '' })
    expect(vm.formatStructuredTimeValue(id, '时段')).toBe('')
  })

  it('getStructuredTimeError / canConfirmStructuredTime 校验结束 > 开始', () => {
    const id = 'schedule-task-cancel'
    vm.$set(vm.structuredTimeSelections, `${id}:时段`, { anchor: '今天', startTime: '18:00', endTime: '14:00' })
    expect(vm.getStructuredTimeError(id, '时段')).toBe('结束时间要晚于开始时间')
    expect(vm.canConfirmStructuredTime(id, '时段')).toBe(false)
    vm.$set(vm.structuredTimeSelections, `${id}:时段`, { anchor: '今天', startTime: '14:00', endTime: '18:00' })
    expect(vm.getStructuredTimeError(id, '时段')).toBe('')
    expect(vm.canConfirmStructuredTime(id, '时段')).toBe(true)
  })

  it('resolveStructuredAnchorDate 解析相对锚点为具体日期,非相对锚点返回空', () => {
    const ymd = (offset) => {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() + offset)
      const p = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    }
    expect(vm.resolveStructuredAnchorDate('今天')).toBe(ymd(0))
    expect(vm.resolveStructuredAnchorDate('明天')).toBe(ymd(1))
    expect(vm.resolveStructuredAnchorDate('后天')).toBe(ymd(2))
    expect(vm.resolveStructuredAnchorDate('周一')).toBe('') // 周几不解析(限今天/明天/后天)
    expect(vm.resolveStructuredAnchorDate('')).toBe('')
  })
})
