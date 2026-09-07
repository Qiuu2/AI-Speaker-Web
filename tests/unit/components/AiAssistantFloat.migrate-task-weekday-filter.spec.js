// T106 迁移任务候选按"原日期的 weekday"过滤(纯前端)——
// 迁移(schedule-task-migrate,task 变体)第三步的任务下拉由前端拼。后端
// /schedules/{name}/tasks 每条 task 已带 weekdays(execmode 已后端换算),但旧
// pickTaskName 只留名字、把 weekdays/startdate/enddate 全丢了,任务下拉只按方案名缓存、
// 不看用户选的原日期 —— 所以"周三无早操却下拉能看到早操"。
//
// 修法:缓存改存富 task(name + weekdays + startdate + enddate);getTaskOptionsForItem
// 读同 item 的"原日期"(task 槽 filterByDate 指向 '原日期')算 weekday,镜像后端
// _task_matches_anchor(kind=='date', allow_recurring_date=True):
//   D∈[startdate,enddate];循环任务(startdate≠enddate)weekday(D)∈weekdays;
//   单日任务(startdate==enddate)仅匹配那天。
// getDay():0=周日,1=周一 … 6=周六,映射回后端口径 周一..周日。
//
// 需 PO 浏览器手测(KP #8):真机迁移选方案+原日期(某个周三),确认早操不再出现。

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

// 已确认口径:2026-06-29 周一 / 2026-07-01 周三 / 2026-07-05 周日。
const MONDAY = '2026-06-29'
const WEDNESDAY = '2026-07-01'
const SUNDAY = '2026-07-05'

// 循环范围任务覆盖整个测试窗;单日任务只在那天。
const RAW_TASKS = [
  { taskname: '早操', weekdays: ['周一', '周二', '周四', '周五'], startdate: '2026-06-01', enddate: '2026-08-31' },
  { taskname: '升旗', weekdays: ['周三'], startdate: '2026-06-01', enddate: '2026-08-31' },
  { taskname: '周末活动', weekdays: ['周日'], startdate: '2026-06-01', enddate: '2026-08-31' },
  { taskname: '眼保健操', weekdays: [], startdate: WEDNESDAY, enddate: WEDNESDAY }
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

function getMigrateItem(vm) {
  let found = null
  vm.manualModules.forEach((module) => {
    (module.items || []).forEach((item) => {
      if (item.id === 'schedule-task-migrate') found = item
    })
  })
  return found
}

function selectSchedule(vm, item, scheduleName) {
  if (!vm.slotSelections[item.id]) vm.$set(vm.slotSelections, item.id, {})
  vm.$set(vm.slotSelections[item.id], '方案', scheduleName)
}

function candidateNames(vm, item) {
  return vm.getTaskOptionsForItem(item).map((opt) => opt.value)
}

describe('T106 getTaskOptionsForItem — 按原日期 weekday 过滤迁移任务候选', () => {
  let vm
  let item
  beforeEach(() => {
    vm = createWrapper().vm
    item = getMigrateItem(vm)
    // 经 buildRichTaskOptions 落缓存(顺带覆盖富 task 构造)。
    selectSchedule(vm, item, '夏季作息')
    vm.$set(vm.taskOptionsBySchedule, '夏季作息', vm.buildRichTaskOptions(RAW_TASKS))
  })

  it('富缓存保留 weekdays / 日期跨度(不再只留名字)', () => {
    const rich = vm.taskOptionsBySchedule['夏季作息']
    expect(rich[0]).toEqual({
      label: '早操',
      value: '早操',
      weekdays: ['周一', '周二', '周四', '周五'],
      startdate: '2026-06-01',
      enddate: '2026-08-31'
    })
  })

  it('原日期=周三 → 候选含升旗,不含早操(周三无早操)', () => {
    vm.setSlotValue(item, '原日期', WEDNESDAY)
    const names = candidateNames(vm, item)
    expect(names).toContain('升旗')
    expect(names).not.toContain('早操')
  })

  it('原日期=周一 → 候选含早操,不含升旗', () => {
    vm.setSlotValue(item, '原日期', MONDAY)
    const names = candidateNames(vm, item)
    expect(names).toContain('早操')
    expect(names).not.toContain('升旗')
  })

  it('周日口径正确(getDay()=0→周日):原日期=周日 → 含周末活动,不含早操/升旗', () => {
    vm.setSlotValue(item, '原日期', SUNDAY)
    const names = candidateNames(vm, item)
    expect(names).toContain('周末活动')
    expect(names).not.toContain('早操')
    expect(names).not.toContain('升旗')
  })

  it('单日任务(startdate==enddate)仅在那天出现', () => {
    vm.setSlotValue(item, '原日期', WEDNESDAY)
    expect(candidateNames(vm, item)).toContain('眼保健操')
    vm.setSlotValue(item, '原日期', MONDAY)
    expect(candidateNames(vm, item)).not.toContain('眼保健操')
  })

  it('日期落在 [startdate,enddate] 之外 → 全部循环任务被排除', () => {
    vm.setSlotValue(item, '原日期', '2026-09-15')
    const names = candidateNames(vm, item)
    expect(names).not.toContain('早操')
    expect(names).not.toContain('升旗')
    expect(names).not.toContain('周末活动')
    expect(names).not.toContain('眼保健操')
  })

  it('原日期未选 → 展示全部(不破坏流程)', () => {
    const names = candidateNames(vm, item)
    expect(names).toEqual(['早操', '升旗', '周末活动', '眼保健操'])
  })

  // reverse-truth:证明"周三看不到早操"确实由 filterByDate 过滤所致,不是别的原因。
  // 去掉过滤依据(getTaskFilterDateKey 返回 '')→ 早操在周三又冒出来。
  it('[reverse-truth] 禁掉原日期过滤依据 → 早操在周三重新出现', () => {
    jest.spyOn(vm, 'getTaskFilterDateKey').mockReturnValue('')
    vm.setSlotValue(item, '原日期', WEDNESDAY)
    expect(candidateNames(vm, item)).toContain('早操')
  })
})

describe('T106 setSlotValue — 改原日期触发重筛 + 清掉不合法的已选任务', () => {
  let vm
  let item
  beforeEach(() => {
    vm = createWrapper().vm
    item = getMigrateItem(vm)
    selectSchedule(vm, item, '夏季作息')
    vm.$set(vm.taskOptionsBySchedule, '夏季作息', vm.buildRichTaskOptions(RAW_TASKS))
  })

  it('周一选早操后改到周三 → 早操(周三非法)被清空', () => {
    vm.setSlotValue(item, '原日期', MONDAY)
    vm.setSlotValue(item, '任务', '早操')
    expect(vm.getSlotValue(item, '任务')).toBe('早操')
    vm.setSlotValue(item, '原日期', WEDNESDAY)
    expect(vm.getSlotValue(item, '任务')).toBe('')
  })

  it('改日期后已选任务仍合法则保留(升旗在周三仍合法)', () => {
    vm.setSlotValue(item, '原日期', WEDNESDAY)
    vm.setSlotValue(item, '任务', '升旗')
    // 周三 → 周三(同 weekday 的另一天不必构造,直接同日验证不误清)
    vm.setSlotValue(item, '原日期', WEDNESDAY)
    expect(vm.getSlotValue(item, '任务')).toBe('升旗')
  })

  it('任务候选未加载时改日期 → 不误清已选任务', () => {
    vm.$set(vm.taskOptionsBySchedule, '夏季作息', undefined)
    vm.$set(vm.slotSelections[item.id], '任务', '早操')
    vm.setSlotValue(item, '原日期', WEDNESDAY)
    expect(vm.getSlotValue(item, '任务')).toBe('早操')
  })
})

describe('T106 ensureTaskOptionsForItem — GET 后落富缓存', () => {
  let vm
  let item
  beforeEach(() => {
    jest.clearAllMocks()
    axios.__mockApi.get.mockResolvedValue({ data: { tasks: RAW_TASKS }})
    vm = createWrapper().vm
    item = getMigrateItem(vm)
    selectSchedule(vm, item, '夏季作息')
  })

  it('拉取后缓存为富 task,周三过滤即时生效', async() => {
    await vm.ensureTaskOptionsForItem(item, { force: true })
    const rich = vm.taskOptionsBySchedule['夏季作息']
    expect(Array.isArray(rich)).toBe(true)
    expect(rich.find((t) => t.value === '升旗').weekdays).toEqual(['周三'])
    vm.setSlotValue(item, '原日期', WEDNESDAY)
    const names = candidateNames(vm, item)
    expect(names).toContain('升旗')
    expect(names).not.toContain('早操')
  })
})
