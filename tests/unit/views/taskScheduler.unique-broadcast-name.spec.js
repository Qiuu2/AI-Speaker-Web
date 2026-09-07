/**
 * T36 Phase 2 tail — buildUniqueBroadcastName must produce a name that
 * does not collide with any local broadcast row. Pre-fix the stamp was
 * minute-granular ("新广播任务-YYYYMMDD-HHmm") so a same-minute
 * double-click hit the remote's state=15 uniqueness check (surfaces as
 * 409 — see add_broadcast). The fix bumps to second granularity AND
 * appends a -2 / -3 / ... dedup suffix when even the second-precise
 * stamp collides (same-second double-click, or stale row carrying the
 * exact stamp).
 *
 * Reverse-truth: deleting the "scan + suffix" branch must make the
 * "same-second collision picks -2" test FAIL.
 */
jest.mock('@/api/dataService', () => ({
  fetchAllAudio: jest.fn(),
  fetchAllLoc: jest.fn(),
  fetchAllTerminalData: jest.fn(),
  fetchAllTask: jest.fn(),
  fetchBroadcasts: jest.fn(),
  fetchLivecasts: jest.fn(),
  fetchBroadcastSchedulesSummary: jest.fn(),
  fetchTaskOverrides: jest.fn(),
  fetchScheduleTasks: jest.fn(),
  setTaskStatus: jest.fn(),
  setScheduleStatus: jest.fn(),
  createScheduleEntry: jest.fn(),
  updateScheduleEntry: jest.fn(),
  deleteScheduleEntry: jest.fn(),
  updateBroadcastSchedules: jest.fn(),
  updateAllTask: jest.fn(),
  updateSingleTask: jest.fn(),
  deleteSingleTask: jest.fn(),
  updateOnceOverrideTask: jest.fn(),
  deleteOnceOverrideTask: jest.fn(),
  undoOnceOverride: jest.fn(),
  addBroadcastImmediate: jest.fn(),
  deleteBroadcastImmediate: jest.fn(),
  commitBroadcastFields: jest.fn()
}))

jest.mock('@/utils/schedulerStorage', () => ({
  getDefaultSchedulerData: jest.fn(() => ({ plans: [], broadcasts: [], livecasts: [] })),
  getDefaultSchedulerDrafts: jest.fn(() => ({ plans: [], planDirtyIds: [], planDeletedIds: [], planBaseSnapshot: [], dirtyScopes: [] })),
  loadSchedulerDrafts: jest.fn(() => ({ plans: [], planDirtyIds: [], planDeletedIds: [], planBaseSnapshot: [], dirtyScopes: [] }))
}))

import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

function makeCtx(broadcasts = []) {
  return {
    modules: { broadcasts }
  }
}

const FIXED_NOW = new Date(2026, 5, 1, 14, 30, 45) // 2026-06-01 14:30:45 (month is 0-indexed)
const EXPECTED_STAMP = '20260601-143045'
const EXPECTED_BASE = `新广播任务-${EXPECTED_STAMP}`

describe('TaskSchedulerPage buildUniqueBroadcastName (T36 Phase 2 tail)', () => {
  let dateSpy
  beforeEach(() => {
    dateSpy = jest.spyOn(global, 'Date').mockImplementation((...args) => {
      if (args.length === 0) return FIXED_NOW
      return new (Function.prototype.bind.apply(Date, [null, ...args]))()
    })
    // jest.spyOn replaces Date so static methods need restoring
    global.Date.now = () => FIXED_NOW.getTime()
  })
  afterEach(() => {
    if (dateSpy) dateSpy.mockRestore()
  })

  it('returns a seconds-precision stamp when the list is empty', () => {
    const ctx = makeCtx([])
    const name = methods.buildUniqueBroadcastName.call(ctx)
    // Seconds granularity is the whole point — a minute-only stamp would
    // collide on rapid double-clicks (the original bug).
    expect(name).toBe(EXPECTED_BASE)
    expect(name).toMatch(/-\d{8}-\d{6}$/)
  })

  it('appends -2 when the base stamp already exists locally (same-second collision)', () => {
    const ctx = makeCtx([
      { name: EXPECTED_BASE, taskid: '73900' }
    ])
    const name = methods.buildUniqueBroadcastName.call(ctx)
    expect(name).toBe(`${EXPECTED_BASE}-2`)
  })

  it('walks suffixes when base + -2 are both taken', () => {
    const ctx = makeCtx([
      { name: EXPECTED_BASE, taskid: '73900' },
      { name: `${EXPECTED_BASE}-2`, taskid: '73901' }
    ])
    const name = methods.buildUniqueBroadcastName.call(ctx)
    expect(name).toBe(`${EXPECTED_BASE}-3`)
  })

  it('ignores rows with empty / missing names when scanning', () => {
    const ctx = makeCtx([
      { name: '', taskid: '1' },
      { name: '   ', taskid: '2' },
      { taskid: '3' }
    ])
    const name = methods.buildUniqueBroadcastName.call(ctx)
    expect(name).toBe(EXPECTED_BASE)
  })

  it('treats the broadcasts list as optional', () => {
    const ctx = { modules: {} }
    const name = methods.buildUniqueBroadcastName.call(ctx)
    expect(name).toBe(EXPECTED_BASE)
  })
})
