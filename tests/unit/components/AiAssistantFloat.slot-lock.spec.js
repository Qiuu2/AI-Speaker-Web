// T100 slot-locking 前端: 指令大全的作息命令,把用户结构化选定的意图 + 方案身份
// 作为独立字段(locked_intent / locked_slots)带给后端(T99 契约 479a73a),避免
// 拍平成纯文本后 OOV 方案名(数字 / 英文如 "6.25cs")被后端重跑 NLU 误分类。
//
// 只在"命令来自指令大全 + 方案是从真列表选中(非 allow-create 手打)"这条精确
// 路径锁;手打命令 / 手打列表外方案 / 非作息命令一律不锁(退回纯 text)。锁错方案
// 身份比不锁更糟,任何不确定就不锁。
//
// 单测验不了端到端(后端真按 locked_intent 走对方案),那部分需 PO 浏览器手测(KP #8)。

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

// 真实方案列表(getSlotOptions('schedule') 用的形态)。6.25cs 就是会被 NLU 误判的
// OOV 数字方案名——本 lane 的靶子。
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

// 模拟用户在指令大全里选好槽位(方案 / 启用停用)。
function selectSlots(vm, itemId, selections) {
  vm.$set(vm.slotSelections, itemId, { ...selections })
}

describe('T100 buildLockedDirective — 两张映射 + 列表判据', () => {
  let vm
  beforeEach(() => {
    vm = createWrapper().vm
    vm.slotOptions.schedule = SCHEDULE_OPTIONS
  })

  it('停用 + 列表选中方案 → disable_schedule + schedule_name', () => {
    const item = manualItem(vm, 'schedule-enable')
    selectSlots(vm, 'schedule-enable', { '启用/停用': '停用', 方案名称: '6.25cs' })
    const directive = vm.buildLockedDirective(item, '停用6.25cs')
    expect(directive).toEqual({
      text: '停用6.25cs',
      intent: 'disable_schedule',
      slots: { schedule_name: '6.25cs' }
    })
  })

  it('启用 + 列表选中方案 → enable_schedule', () => {
    const item = manualItem(vm, 'schedule-enable')
    selectSlots(vm, 'schedule-enable', { '启用/停用': '启用', 方案名称: '春季作息' })
    const directive = vm.buildLockedDirective(item, '启用春季作息')
    expect(directive.intent).toBe('enable_schedule')
    expect(directive.slots).toEqual({ schedule_name: '春季作息' })
  })

  it('任务对调(swap)→ swap_schedule', () => {
    const item = manualItem(vm, 'schedule-swap')
    selectSlots(vm, 'schedule-swap', { 方案: '春季作息' })
    expect(vm.buildLockedDirective(item, 'x').intent).toBe('swap_schedule')
  })

  it('任务迁移(move)→ move_schedule', () => {
    const item = manualItem(vm, 'schedule-task-migrate')
    selectSlots(vm, 'schedule-task-migrate', { 方案: '春季作息' })
    expect(vm.buildLockedDirective(item, 'x').intent).toBe('move_schedule')
  })

  // T122: 取消命令已改成"按天 / 按时段"(无方案槽,跨所有启用方案 + 文件广播)。
  // 默认变体 = date(按天),选日期 → 锁 cancel_schedule + 整天 time_range,不锁方案。
  it('任务取消 按天(选日期)→ cancel_schedule + 整天 time_range(不锁方案,跨所有)', () => {
    const item = manualItem(vm, 'schedule-task-cancel')
    selectSlots(vm, 'schedule-task-cancel', { 日期: '2026-07-01' })
    const directive = vm.buildLockedDirective(item, 'x')
    expect(directive.intent).toBe('cancel_schedule')
    // f1(BLOCKER):跨所有启用方案靠 schedule_scope='enabled_all',不锁 schedule_name。
    expect(directive.slots).toEqual({
      time_range_start: '2026-07-01 00:00',
      time_range_end: '2026-07-01 23:59',
      schedule_scope: 'enabled_all'
    })
    expect('schedule_name' in directive.slots).toBe(false)
  })

  it('方案手打列表外值 → 不锁(null)', () => {
    const item = manualItem(vm, 'schedule-enable')
    selectSlots(vm, 'schedule-enable', { '启用/停用': '停用', 方案名称: '我手打的方案' })
    expect(vm.buildLockedDirective(item, '停用我手打的方案')).toBeNull()
  })

  it('启用/停用未选 → 不锁(null)', () => {
    const item = manualItem(vm, 'schedule-enable')
    selectSlots(vm, 'schedule-enable', { 方案名称: '6.25cs' })
    expect(vm.buildLockedDirective(item, 'x')).toBeNull()
  })

  it('非作息命令(终端启用)→ 不锁(null)', () => {
    const item = manualItem(vm, 'terminal-enable')
    expect(vm.buildLockedDirective(item, 'x')).toBeNull()
  })
})

describe('T100 consumeLockedDirective — one-shot + 文本逐字匹配', () => {
  let vm
  beforeEach(() => {
    vm = createWrapper().vm
  })

  it('文本一致 → 返回锁,且一次性清掉', () => {
    vm.pendingLockedDirective = { text: '停用6.25cs', intent: 'disable_schedule', slots: { schedule_name: '6.25cs' }}
    expect(vm.consumeLockedDirective('停用6.25cs')).toBeTruthy()
    expect(vm.pendingLockedDirective).toBeNull()
    // 已消费,再取一次就是 null(不残留)。
    expect(vm.consumeLockedDirective('停用6.25cs')).toBeNull()
  })

  it('文本被改过 → 不返回锁(退回 NLU),仍清掉', () => {
    vm.pendingLockedDirective = { text: '停用6.25cs', intent: 'disable_schedule', slots: { schedule_name: '6.25cs' }}
    expect(vm.consumeLockedDirective('停用春季作息')).toBeNull()
    expect(vm.pendingLockedDirective).toBeNull()
  })
})

describe('T100 发送 body — 指令大全作息命令带锁,别的不带', () => {
  let wrapper
  let vm
  beforeEach(() => {
    jest.clearAllMocks()
    axios.__mockApi.get.mockResolvedValue({ data: { schedules: [] }})
    axios.__mockApi.post.mockResolvedValue({
      data: { output_speech: 'ok', reply: 'ok', intent: 'noop', confidence: 1, missing_slots: [], diagnostics: [], action_log: [] }
    })
    wrapper = createWrapper()
    vm = wrapper.vm
    jest.spyOn(vm, 'fetchAssistantLogs').mockImplementation(() => Promise.resolve())
    vm.slotOptions.schedule = SCHEDULE_OPTIONS
  })

  function lastPostBody() {
    const calls = axios.__mockApi.post.mock.calls
    return calls[calls.length - 1][1]
  }

  it('case1: 指令大全"停用" + 列表选 6.25cs → body 带 disable_schedule + schedule_name', async() => {
    const item = manualItem(vm, 'schedule-enable')
    selectSlots(vm, 'schedule-enable', { '启用/停用': '停用', 方案名称: '6.25cs' })
    vm.fillFromTemplate(item)
    expect(vm.command).toBe('停用6.25cs')
    await vm.sendToAssistant()
    const body = lastPostBody()
    expect(body.text).toBe('停用6.25cs')
    expect(body.locked_intent).toBe('disable_schedule')
    expect(body.locked_slots).toEqual({ schedule_name: '6.25cs' })
  })

  it('case2: 指令大全"启用" + 列表选方案 → locked_intent=enable_schedule', async() => {
    const item = manualItem(vm, 'schedule-enable')
    selectSlots(vm, 'schedule-enable', { '启用/停用': '启用', 方案名称: '春季作息' })
    vm.fillFromTemplate(item)
    await vm.sendToAssistant()
    const body = lastPostBody()
    expect(body.locked_intent).toBe('enable_schedule')
    expect(body.locked_slots).toEqual({ schedule_name: '春季作息' })
  })

  it('case3: 方案手打列表外值 → 不带 lock 字段(退回纯 text)', async() => {
    const item = manualItem(vm, 'schedule-enable')
    selectSlots(vm, 'schedule-enable', { '启用/停用': '停用', 方案名称: '临时手打方案' })
    vm.fillFromTemplate(item)
    await vm.sendToAssistant()
    const body = lastPostBody()
    expect(body).toEqual({ text: '停用临时手打方案' })
    expect(body.locked_intent).toBeUndefined()
    expect(body.locked_slots).toBeUndefined()
  })

  it('case4: 普通手打命令(不走指令大全)→ 不带 lock', async() => {
    vm.command = '把大厅终端停用'
    await vm.sendToAssistant()
    expect(lastPostBody()).toEqual({ text: '把大厅终端停用' })
  })

  it('case5: 锁定发送后 directive 被清,下一条普通命令不带残留 lock', async() => {
    const item = manualItem(vm, 'schedule-enable')
    selectSlots(vm, 'schedule-enable', { '启用/停用': '停用', 方案名称: '6.25cs' })
    vm.fillFromTemplate(item)
    await vm.sendToAssistant()
    expect(lastPostBody().locked_intent).toBe('disable_schedule')
    // 紧接着手打一条普通命令(直接走发送 funnel,等价于用户在输入框敲后点发送)。
    await vm.submitAssistantText('播放上课铃')
    const body = lastPostBody()
    expect(body).toEqual({ text: '播放上课铃' })
    expect(vm.pendingLockedDirective).toBeNull()
  })

  it('case6: 模板填入后用户改了文本 → 不带 lock(逐字不符退回 NLU)', async() => {
    const item = manualItem(vm, 'schedule-enable')
    selectSlots(vm, 'schedule-enable', { '启用/停用': '停用', 方案名称: '6.25cs' })
    vm.fillFromTemplate(item)
    // 用户在输入框里改动了命令文本。
    vm.command = '停用6.25cs的某个东西'
    await vm.sendToAssistant()
    expect(lastPostBody()).toEqual({ text: '停用6.25cs的某个东西' })
  })

  it('case7: 采用历史建议会清掉待发锁,发出去不带 lock', async() => {
    const item = manualItem(vm, 'schedule-enable')
    selectSlots(vm, 'schedule-enable', { '启用/停用': '停用', 方案名称: '6.25cs' })
    vm.fillFromTemplate(item)
    expect(vm.pendingLockedDirective).not.toBeNull()
    vm.applySuggestion({ text: '停用6.25cs' })
    await vm.sendToAssistant()
    expect(lastPostBody()).toEqual({ text: '停用6.25cs' })
  })
})
