// T105 复制方案并改时间接 slot-locking —— "复制方案并改时间"表单三值(源方案 / 偏移分钟 /
// 新名)都是显式结构化输入,applyCloneSchedule 直接构造 locked_intent / locked_slots 带给后端
// (T99 契约),绕开"创建为"OOV:该词在锁定训练集 0 样本,纯 NLU 抽不到 new_schedule_name,
// 后端 shift handler 硬要新名 → 退回追问、像没执行(见 scout T101 报告 / KP #21)。
//
// 方向靠 intent 区分(offset>=0 → shift_schedule_later,否则 shift_schedule_earlier);
// time_offset 传正数量级 + "分钟"(handler 内部按 intent 决定正负、要求 > 0)。offset<=0 前端拦。
//
// 端到端(后端真按 locked_* 走 shift、用锁的新名建方案)由 backend
// test_assistant_chat_slot_locking.py 覆盖 + PO 浏览器手测(KP #8)。

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

let messageWarning

function createWrapper() {
  messageWarning = jest.fn()
  return shallowMount(AiAssistantFloat, {
    stubs: elementStubs,
    mocks: {
      $message: { warning: messageWarning, error: jest.fn(), success: jest.fn() },
      $notify: jest.fn(),
      $root: { $emit: jest.fn(), $on: jest.fn(), $off: jest.fn() }
    }
  })
}

function setCloneForm(vm, { source, offset, name }) {
  if (source !== undefined) vm.updateCloneForm('source', source)
  if (offset !== undefined) vm.updateCloneForm('offset', offset)
  if (name !== undefined) vm.updateCloneForm('name', name)
}

// 从组件真实的 manualModules 里按 id 取 item(不自造,测真定义)。
function manualItem(vm, id) {
  const item = vm.manualModules
    .reduce((acc, mod) => acc.concat(mod.items || []), [])
    .find((it) => it.id === id)
  if (!item) throw new Error(`manual item not found: ${id}`)
  return item
}

describe('T105 applyCloneSchedule — 构造锁定 directive', () => {
  let vm
  beforeEach(() => {
    vm = createWrapper().vm
  })

  it('正偏移 → shift_schedule_later + 三槽(time_offset 带"分钟")', () => {
    setCloneForm(vm, { source: '6.25cs', offset: 30, name: '临时测试' })
    vm.applyCloneSchedule()
    expect(vm.pendingLockedDirective).toEqual({
      text: vm.command,
      intent: 'shift_schedule_later',
      slots: {
        schedule_name: '6.25cs',
        new_schedule_name: '临时测试',
        time_offset: '30分钟'
      }
    })
    // 文本照常填进输入框(保留给用户看),且锁的 text 与之逐字相同(consume 时才匹配)。
    expect(vm.command).toBe('请复制“6.25cs”，所有任务往后推迟30分钟，创建为“临时测试”。')
  })

  it('负偏移 → shift_schedule_earlier,time_offset 是正数量级(45 不是 -45)', () => {
    setCloneForm(vm, { source: '春季作息', offset: -45, name: '提前版' })
    vm.applyCloneSchedule()
    expect(vm.pendingLockedDirective.intent).toBe('shift_schedule_earlier')
    expect(vm.pendingLockedDirective.slots.time_offset).toBe('45分钟')
    expect(vm.command).toContain('往前提前45分钟')
  })

  it('offset=0 → 提示"大于 0 分钟"、不锁、不填命令(handler 要求 > 0)', () => {
    setCloneForm(vm, { source: '春季作息', offset: 0, name: '零偏移' })
    vm.applyCloneSchedule()
    expect(messageWarning).toHaveBeenCalledWith('偏移时间要大于 0 分钟')
    expect(vm.pendingLockedDirective).toBeNull()
    expect(vm.command).toBe('')
  })

  it('源方案 / 新名留空 → 回落默认值,仍锁三槽', () => {
    setCloneForm(vm, { source: '  ', offset: 15, name: '' })
    vm.applyCloneSchedule()
    expect(vm.pendingLockedDirective.slots).toEqual({
      schedule_name: '春季作息',
      new_schedule_name: '新作息',
      time_offset: '15分钟'
    })
  })
})

describe('T105 发送 body — 复制表单带锁,格式对齐 shift handler', () => {
  let vm
  beforeEach(() => {
    jest.clearAllMocks()
    axios.__mockApi.get.mockResolvedValue({ data: { schedules: [] }})
    axios.__mockApi.post.mockResolvedValue({
      data: { output_speech: 'ok', reply: 'ok', intent: 'shift_schedule_later', confidence: 1, missing_slots: [], diagnostics: [], action_log: [] }
    })
    vm = createWrapper().vm
    jest.spyOn(vm, 'fetchAssistantLogs').mockImplementation(() => Promise.resolve())
  })

  function lastPostBody() {
    const calls = axios.__mockApi.post.mock.calls
    return calls[calls.length - 1][1]
  }

  it('生成指令 → 发送 → body 带 locked_intent(方向对) + locked_slots(三槽对)', async() => {
    setCloneForm(vm, { source: '6.25cs', offset: 30, name: '临时测试' })
    vm.applyCloneSchedule()
    await vm.sendToAssistant()
    const body = lastPostBody()
    expect(body.text).toBe('请复制“6.25cs”，所有任务往后推迟30分钟，创建为“临时测试”。')
    expect(body.locked_intent).toBe('shift_schedule_later')
    expect(body.locked_slots).toEqual({
      schedule_name: '6.25cs',
      new_schedule_name: '临时测试',
      time_offset: '30分钟'
    })
  })

  it('负偏移发送 → body.locked_intent=shift_schedule_earlier', async() => {
    setCloneForm(vm, { source: '春季作息', offset: -20, name: '早版' })
    vm.applyCloneSchedule()
    await vm.sendToAssistant()
    expect(lastPostBody().locked_intent).toBe('shift_schedule_earlier')
    expect(lastPostBody().locked_slots.time_offset).toBe('20分钟')
  })

  it('offset=0 → 没发请求(前端拦在生成前)', async() => {
    setCloneForm(vm, { source: '春季作息', offset: 0, name: 'x' })
    vm.applyCloneSchedule()
    await vm.sendToAssistant()
    expect(axios.__mockApi.post).not.toHaveBeenCalled()
  })

  it('one-shot:锁发送后被清,紧接的普通命令不带残留 lock', async() => {
    setCloneForm(vm, { source: '6.25cs', offset: 30, name: '临时测试' })
    vm.applyCloneSchedule()
    await vm.sendToAssistant()
    expect(lastPostBody().locked_intent).toBe('shift_schedule_later')
    await vm.submitAssistantText('播放上课铃')
    expect(lastPostBody()).toEqual({ text: '播放上课铃' })
    expect(vm.pendingLockedDirective).toBeNull()
  })

  it('生成后用户改了文本 → 逐字不符退回 NLU(不带 lock)', async() => {
    setCloneForm(vm, { source: '6.25cs', offset: 30, name: '临时测试' })
    vm.applyCloneSchedule()
    vm.command = '请复制“6.25cs”，所有任务往后推迟30分钟，创建为“临时测试”，再多加一句'
    await vm.sendToAssistant()
    const body = lastPostBody()
    expect(body.locked_intent).toBeUndefined()
    expect(body.locked_slots).toBeUndefined()
  })
})

// XC-1(T109):复制卡片除表单"生成指令"(唯一锁定路)外,通用"点击填入"
// (fillFromTemplate)与推荐示例点击(fillCommand)都不带 clone 锁 → 会发出"…创建为…"
// 无锁 OOV 命令 → 后端 shift handler 抽不到 new_schedule_name → 退回追问、像没执行。
// 修法:对带专属表单的卡片(schedule-clone)隐藏这两条通用无锁入口,只留表单锁定路。
describe('T109 复制卡片无"无锁 OOV 发送"入口 —— 表单卡隐藏通用填入/示例', () => {
  let vm
  beforeEach(() => {
    vm = createWrapper().vm
    vm.slotOptions.schedule = [
      { label: '春季作息', value: '春季作息', status: '启用', displayLabel: '春季作息 (启动)' }
    ]
  })

  it('schedule-clone 有专属表单 → isManualFormCard 为真', () => {
    expect(vm.isManualFormCard(manualItem(vm, 'schedule-clone'))).toBe(true)
  })

  it('schedule-clone 的通用"点击填入"入口不渲染(该入口不可用)', () => {
    // 即便该卡确实定义了 template(否则通用卡会渲染填入),表单卡也不给通用填入入口。
    expect(vm.getManualTemplate(manualItem(vm, 'schedule-clone'))).toBeTruthy()
    expect(vm.showManualTemplateFill(manualItem(vm, 'schedule-clone'))).toBe(false)
  })

  it('schedule-clone 的推荐示例点击入口不渲染(避开"创建为"OOV 无锁发送)', () => {
    expect(vm.getManualExamples(manualItem(vm, 'schedule-clone')).length).toBeGreaterThan(0)
    expect(vm.showManualExamples(manualItem(vm, 'schedule-clone'))).toBe(false)
  })

  it('正对照:非表单卡(schedule-enable)通用填入 + 示例照常渲染,别的卡不受影响', () => {
    const enable = manualItem(vm, 'schedule-enable')
    expect(vm.isManualFormCard(enable)).toBe(false)
    expect(vm.showManualTemplateFill(enable)).toBe(true)
    expect(vm.showManualExamples(enable)).toBe(true)
  })

  it('唯一留下的表单"生成指令"路仍锁三槽(无锁入口清空后不误伤锁定路)', () => {
    setCloneForm(vm, { source: '春季作息', offset: 30, name: '临时测试' })
    vm.applyCloneSchedule()
    expect(vm.pendingLockedDirective).toEqual({
      text: vm.command,
      intent: 'shift_schedule_later',
      slots: { schedule_name: '春季作息', new_schedule_name: '临时测试', time_offset: '30分钟' }
    })
  })
})
