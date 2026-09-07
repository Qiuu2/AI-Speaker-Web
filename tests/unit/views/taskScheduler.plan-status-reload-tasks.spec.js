// T70: enabling/disabling a plan flips the task-level state the expanded rows
// show, but applyImmediatePlanStatus previously only updated plan.status — an
// already-expanded plan kept showing the pre-toggle task state until a manual
// refresh (loadPlanTasks no-ops on tasksLoaded). The fix force-reloads each
// expanded plan's task rows via reloadPlanTasksFromRemote (which bypasses the
// tasksLoaded guard) right after the remote status write succeeds.

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
  undoOnceOverride: jest.fn()
}))

import { setScheduleStatus } from '@/api/dataService'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

// Build a ctx that runs the REAL applyImmediatePlanStatus but stubs its helper
// methods to their observable effects, so the test isolates the post-success
// task-reload behavior. `plans` are the expanded/collapsed plan objects the
// resolver will find by name.
function statusCtx(plans, { confirm = true } = {}) {
  return {
    modules: { plans },
    busyActionKey: '',
    $message: { warning: jest.fn(), success: jest.fn(), error: jest.fn() },
    normalizePlanDraftIds: (ids) => (Array.isArray(ids) ? ids.map((id) => String(id ?? '')) : []),
    confirmSaveBeforePlanStatus: jest.fn().mockResolvedValue(confirm),
    preparePlanRows: (rows) => rows,
    syncPersistedPlanStatuses: jest.fn(),
    planSaveError: jest.fn(),
    resolvePlanByName: methods.resolvePlanByName,
    reloadPlanTasksFromRemote: jest.fn(),
    runBusyAction: methods.runBusyAction
  }
}

describe('T70 applyImmediatePlanStatus — reload expanded plan tasks after status toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reloads the task rows of an expanded plan after enable succeeds', async() => {
    setScheduleStatus.mockResolvedValue({})
    const expanded = { id: 'p1', name: '美国作息', originName: '美国作息', tasksLoaded: true }
    const ctx = statusCtx([expanded])

    const ok = await methods.applyImmediatePlanStatus.call(ctx, [{ id: 'p1' }], '启用')

    expect(ok).toBe(true)
    expect(setScheduleStatus).toHaveBeenCalledWith({ schedule_names: ['美国作息'], status: '启用' })
    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledTimes(1)
    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledWith(expanded, { silent: true })
  })

  it('reloads after disable too (status-agnostic refresh)', async() => {
    setScheduleStatus.mockResolvedValue({})
    const expanded = { id: 'p1', name: '美国作息', originName: '美国作息', tasksLoaded: true }
    const ctx = statusCtx([expanded])

    await methods.applyImmediatePlanStatus.call(ctx, [{ id: 'p1' }], '停用')

    expect(setScheduleStatus).toHaveBeenCalledWith({ schedule_names: ['美国作息'], status: '停用' })
    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledWith(expanded, { silent: true })
  })

  it('reverse-truth: does NOT reload a collapsed (not-yet-loaded) plan', async() => {
    setScheduleStatus.mockResolvedValue({})
    const collapsed = { id: 'p1', name: '美国作息', originName: '美国作息', tasksLoaded: false }
    const ctx = statusCtx([collapsed])

    await methods.applyImmediatePlanStatus.call(ctx, [{ id: 'p1' }], '启用')

    expect(setScheduleStatus).toHaveBeenCalled()
    expect(ctx.reloadPlanTasksFromRemote).not.toHaveBeenCalled()
  })

  it('reverse-truth: does NOT reload when the remote status write fails', async() => {
    setScheduleStatus.mockRejectedValue(new Error('vendor 500'))
    const expanded = { id: 'p1', name: '美国作息', originName: '美国作息', tasksLoaded: true }
    const ctx = statusCtx([expanded])

    const ok = await methods.applyImmediatePlanStatus.call(ctx, [{ id: 'p1' }], '启用')

    expect(ok).toBe(false)
    expect(ctx.planSaveError).toHaveBeenCalled()
    expect(ctx.reloadPlanTasksFromRemote).not.toHaveBeenCalled()
  })

  it('only reloads the expanded plans in a mixed multi-select', async() => {
    setScheduleStatus.mockResolvedValue({})
    const expanded = { id: 'p1', name: '美国作息', originName: '美国作息', tasksLoaded: true }
    const collapsed = { id: 'p2', name: '夏季作息', originName: '夏季作息', tasksLoaded: false }
    const ctx = statusCtx([expanded, collapsed])

    await methods.applyImmediatePlanStatus.call(ctx, [{ id: 'p1' }, { id: 'p2' }], '启用')

    expect(setScheduleStatus).toHaveBeenCalledWith({
      schedule_names: ['美国作息', '夏季作息'],
      status: '启用'
    })
    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledTimes(1)
    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledWith(expanded, { silent: true })
  })
})
