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
  'el-tag', 'el-input-number', 'el-date-picker', 'el-radio-group', 'el-radio-button'
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

describe('T108 buildLockedDirective — 任务变体锁 task_name / 日期变体不锁', () => {
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

  it('case3: cancel 任务变体 + 选方案 + 选任务 → slots 含 task_name + schedule_name', () => {
    const item = manualItem(vm, 'schedule-task-cancel')
    selectSlots(vm, 'schedule-task-cancel', {
      方案: '6.25cs', 日期: '2026-07-01', 任务: '第一节课上课铃'
    })
    const directive = vm.buildLockedDirective(item, 'x')
    expect(directive.intent).toBe('cancel_schedule')
    expect(directive.slots).toEqual({ schedule_name: '6.25cs', task_name: '第一节课上课铃' })
  })

  it('case4: cancel 日期变体(无 task 槽)→ slots 不含 task_name', () => {
    const item = manualItem(vm, 'schedule-task-cancel')
    vm.$set(vm.manualVariantState, 'schedule-task-cancel', 'date')
    selectSlots(vm, 'schedule-task-cancel', { 方案: '6.25cs', 日期: '2026-07-01' })
    const directive = vm.buildLockedDirective(item, 'x')
    expect(directive.slots).toEqual({ schedule_name: '6.25cs' })
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

  // reverse-truth:证明 case1/case3 的 task_name 确实由新分支(getSelectedTaskValue)锁进去。
  // 禁掉该分支(getSelectedTaskValue 恒返回 '')→ task_name 缺席。
  it('[reverse-truth] 禁掉锁 task_name 分支 → migrate/cancel 任务变体 task_name 缺席', () => {
    jest.spyOn(vm, 'getSelectedTaskValue').mockReturnValue('')
    const migrate = manualItem(vm, 'schedule-task-migrate')
    selectSlots(vm, 'schedule-task-migrate', {
      方案: '春季作息', 原日期: '2026-07-01', 任务: '第一节课上课铃', 目标日期: '2026-07-03'
    })
    expect(vm.buildLockedDirective(migrate, 'x').slots).toEqual({ schedule_name: '春季作息' })

    const cancel = manualItem(vm, 'schedule-task-cancel')
    selectSlots(vm, 'schedule-task-cancel', { 方案: '6.25cs', 日期: '2026-07-01', 任务: '第一节课上课铃' })
    expect(vm.buildLockedDirective(cancel, 'x').slots).toEqual({ schedule_name: '6.25cs' })
  })
})

describe('T108 发送 body — 任务变体发送时 locked_slots 带 task_name', () => {
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

  it('cancel 任务变体填模板 → 发送 body.locked_slots 含 task_name + schedule_name', async() => {
    const item = manualItem(vm, 'schedule-task-cancel')
    selectSlots(vm, 'schedule-task-cancel', {
      方案: '6.25cs', 日期: '2026-07-01', 任务: '第一节课上课铃'
    })
    vm.fillFromTemplate(item)
    await vm.sendToAssistant()
    const body = lastPostBody()
    expect(body.locked_intent).toBe('cancel_schedule')
    expect(body.locked_slots).toEqual({ schedule_name: '6.25cs', task_name: '第一节课上课铃' })
  })
})
