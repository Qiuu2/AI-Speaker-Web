// F1 (T43 H2 follow-up): the plans summary draws task_count from the flat
// sechinfoall endpoint, which returns a single placeholder row for a
// just-created schedule while the authoritative per-schedule sechetaskinfo
// endpoint already holds the full set. That makes a fresh plan display "1 task"
// until refresh/expand. warmSuspectPlanTaskCounts() silently re-fetches any
// unloaded plan whose summary count is <= 1 via the authoritative
// loadPlanTasks path so the count self-corrects in place — without ever
// touching the draft dirty calculation (KP #22 phantom-dirty guard).

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

import { fetchScheduleTasks } from '@/api/dataService'
import { hasSchedulerDirtyScope } from '@/utils/schedulerStorage'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

const flushMicrotasks = async(count = 5) => {
  for (let i = 0; i < count; i += 1) await Promise.resolve()
}

function warmCtx(plans) {
  return {
    modules: { plans },
    warmedPlanNames: new Set(),
    warmPlanKey: methods.warmPlanKey,
    pruneWarmedPlanNames: methods.pruneWarmedPlanNames,
    reloadPlanTasksFromRemote: jest.fn()
  }
}

describe('F1 + T46 warmSuspectPlanTaskCounts — silent authoritative count correction', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('warms a plan whose summary count collapsed to 1 (the original bug case)', () => {
    const suspect = { name: '美', tasksLoaded: false, taskCount: 1 }
    const ctx = warmCtx([suspect])

    methods.warmSuspectPlanTaskCounts.call(ctx)

    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledTimes(1)
    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledWith(suspect, { silent: true })
  })

  it('warms a plan reported with 0 tasks (placeholder all-null row)', () => {
    const suspect = { name: '空', tasksLoaded: false, taskCount: 0 }
    const ctx = warmCtx([suspect])

    methods.warmSuspectPlanTaskCounts.call(ctx)

    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledTimes(1)
  })

  // T46: the AI-create refresh comes through the full endpoint, which sets
  // tasks_loaded=true + taskCount=1 on the placeholder row. The old guard
  // (tasksLoaded === false) let it slip uncorrected — this is the precise
  // F1-miss the relaxed guard fixes.
  it('T46: warms a tasksLoaded=true + taskCount=1 plan (AI-create path)', () => {
    const aiCreated = { name: '美国作息', tasksLoaded: true, taskCount: 1 }
    const ctx = warmCtx([aiCreated])

    methods.warmSuspectPlanTaskCounts.call(ctx)

    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledTimes(1)
    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledWith(aiCreated, { silent: true })
  })

  it('does NOT warm a plan whose count is already > 1 (reverse-truth)', () => {
    const ctx = warmCtx([{ name: '夏季作息', tasksLoaded: true, taskCount: 14 }])

    methods.warmSuspectPlanTaskCounts.call(ctx)

    expect(ctx.reloadPlanTasksFromRemote).not.toHaveBeenCalled()
  })

  it('does NOT re-warm the same plan name across refreshes (Set keyed by name)', () => {
    const suspect = { id: '美国作息', name: '美国作息', tasksLoaded: true, taskCount: 1 }
    const ctx = warmCtx([suspect])

    methods.warmSuspectPlanTaskCounts.call(ctx)
    methods.warmSuspectPlanTaskCounts.call(ctx) // second refresh tick

    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledTimes(1)
    expect(ctx.warmedPlanNames.has('美国作息')).toBe(true)
  })

  it('does NOT re-warm even when the plan OBJECT is rebuilt between refreshes', () => {
    // Each refresh rebuilds plan objects (buildPlanFromSchedule). A per-object
    // flag would reset and re-warm; the name-keyed Set must still suppress it.
    const ctx = warmCtx([{ id: '美国作息', name: '美国作息', tasksLoaded: true, taskCount: 1 }])
    methods.warmSuspectPlanTaskCounts.call(ctx)

    // simulate the next refresh handing in a brand-new object for the same name
    ctx.modules.plans = [{ id: '美国作息', name: '美国作息', tasksLoaded: true, taskCount: 1 }]
    methods.warmSuspectPlanTaskCounts.call(ctx)

    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledTimes(1)
  })

  it('re-warms a same-name plan after it was deleted and recreated (prune)', () => {
    const ctx = warmCtx([{ id: '美国作息', name: '美国作息', tasksLoaded: true, taskCount: 1 }])
    methods.warmSuspectPlanTaskCounts.call(ctx)
    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledTimes(1)

    // plan deleted: a refresh hands in a list without it → prune drops the name
    ctx.modules.plans = [{ id: '夏季作息', name: '夏季作息', tasksLoaded: true, taskCount: 14 }]
    methods.warmSuspectPlanTaskCounts.call(ctx)
    expect(ctx.warmedPlanNames.has('美国作息')).toBe(false)

    // recreated with the same name → warmed again
    ctx.modules.plans = [{ id: '美国作息', name: '美国作息', tasksLoaded: true, taskCount: 1 }]
    methods.warmSuspectPlanTaskCounts.call(ctx)
    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledTimes(2)
  })

  it('only warms the suspect plans in a mixed list', () => {
    const suspect = { name: '美', tasksLoaded: true, taskCount: 1 }
    const ctx = warmCtx([
      { name: '夏季作息', tasksLoaded: true, taskCount: 14 },
      suspect,
      { name: '冬季作息', tasksLoaded: true, taskCount: 8 }
    ])

    methods.warmSuspectPlanTaskCounts.call(ctx)

    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledTimes(1)
    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledWith(suspect, { silent: true })
  })

  it('is a no-op when modules.plans is missing or empty', () => {
    const empty = {
      modules: {},
      warmedPlanNames: new Set(),
      warmPlanKey: methods.warmPlanKey,
      pruneWarmedPlanNames: methods.pruneWarmedPlanNames,
      reloadPlanTasksFromRemote: jest.fn()
    }
    methods.warmSuspectPlanTaskCounts.call(empty)
    expect(empty.reloadPlanTasksFromRemote).not.toHaveBeenCalled()

    const blank = warmCtx([])
    methods.warmSuspectPlanTaskCounts.call(blank)
    expect(blank.reloadPlanTasksFromRemote).not.toHaveBeenCalled()
  })

  it('the authoritative correction does NOT flip the plan draft dirty state (KP #22 guard)', async() => {
    // Run the real reloadPlanTasksFromRemote path against an empty draftState
    // and assert hasSchedulerDirtyScope('plans') stays false: the warm must
    // correct the displayed count without ever writing the draft.
    // applyPlanTasksPayload is mocked to its observable effect on the plan
    // (count/loaded) so the test doesn't pull in the full task-mapping tree,
    // but the reload itself runs for real — and the assertion is that no draft
    // write occurs along the way.
    fetchScheduleTasks.mockResolvedValue({
      tasks: Array.from({ length: 14 }, (_, i) => ({ taskname: `任务${i + 1}`, time: '08:00:00' }))
    })

    const suspect = { name: '美', tasksLoaded: true, taskCount: 1, tasks: [] }
    const draftState = { plans: [], planDirtyIds: [], planDeletedIds: [], planBaseSnapshot: [], dirtyScopes: [] }
    const ctx = {
      modules: { plans: [suspect] },
      draftState,
      warmedPlanNames: new Set(),
      warmPlanKey: methods.warmPlanKey,
      pruneWarmedPlanNames: methods.pruneWarmedPlanNames,
      $message: { error: jest.fn() },
      setPlanTasksLoading: methods.setPlanTasksLoading,
      reloadPlanTasksFromRemote: methods.reloadPlanTasksFromRemote,
      applyPlanTasksPayload: jest.fn((plan, tasks) => {
        plan.tasks = tasks
        plan.tasksLoaded = true
        plan.taskCount = tasks.length
      }),
      savePlanDraftState: jest.fn()
    }

    methods.warmSuspectPlanTaskCounts.call(ctx)
    await flushMicrotasks()

    // the authoritative fetch ran and the count self-corrected to 14
    expect(fetchScheduleTasks).toHaveBeenCalledWith('美')
    expect(ctx.$message.error).not.toHaveBeenCalled()
    expect(suspect.taskCount).toBe(14)
    expect(suspect.tasksLoaded).toBe(true)
    // and no draft was written anywhere on the warm path
    expect(ctx.savePlanDraftState).not.toHaveBeenCalled()
    expect(hasSchedulerDirtyScope('plans', draftState)).toBe(false)
  })
})

describe('F5 loadPlanTasks silent mode — warm failures stay quiet, manual ones surface', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  function loadCtx() {
    return {
      $message: { error: jest.fn() },
      setPlanTasksLoading: methods.setPlanTasksLoading,
      applyPlanTasksPayload: jest.fn(),
      loadPlanTasks: methods.loadPlanTasks,
      reloadPlanTasksFromRemote: methods.reloadPlanTasksFromRemote
    }
  }

  // The warm path now goes through reloadPlanTasksFromRemote (T46): a failed
  // silent reload must stay quiet; a default reload (per-edit refresh) still
  // surfaces the error.
  it('a failed silent reload (the warm path) does NOT show the error toast', async() => {
    fetchScheduleTasks.mockRejectedValue(new Error('network down'))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = loadCtx()
    const plan = { name: '美', tasksLoaded: true, taskCount: 1, tasks: [] }

    await methods.reloadPlanTasksFromRemote.call(ctx, plan, { silent: true })

    expect(fetchScheduleTasks).toHaveBeenCalledWith('美')
    expect(ctx.$message.error).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    expect(plan.tasksLoading).toBe(false)
    warn.mockRestore()
  })

  it('a failed default reload (per-edit refresh) STILL shows the error toast', async() => {
    fetchScheduleTasks.mockRejectedValue(new Error('network down'))
    const ctx = loadCtx()
    const plan = { name: '美', tasksLoaded: true, taskCount: 1, tasks: [] }

    await methods.reloadPlanTasksFromRemote.call(ctx, plan)

    expect(ctx.$message.error).toHaveBeenCalledWith('刷新方案任务失败')
    expect(plan.tasksLoading).toBe(false)
  })

  // The manual expand path (loadPlanTasks) keeps its own silent/non-silent
  // behavior unchanged — F5 must not regress it.
  it('manual expand (loadPlanTasks default) STILL shows the error toast', async() => {
    fetchScheduleTasks.mockRejectedValue(new Error('network down'))
    const ctx = loadCtx()
    const plan = { name: '美', tasksLoaded: false, taskCount: 1, tasks: [] }

    await methods.loadPlanTasks.call(ctx, plan)

    expect(ctx.$message.error).toHaveBeenCalledWith('加载方案任务失败')
    expect(plan.tasksLoading).toBe(false)
  })

  it('warmSuspectPlanTaskCounts requests the silent reload variant', () => {
    const suspect = { name: '美', tasksLoaded: true, taskCount: 1 }
    const ctx = {
      modules: { plans: [suspect] },
      warmedPlanNames: new Set(),
      warmPlanKey: methods.warmPlanKey,
      pruneWarmedPlanNames: methods.pruneWarmedPlanNames,
      reloadPlanTasksFromRemote: jest.fn()
    }

    methods.warmSuspectPlanTaskCounts.call(ctx)

    expect(ctx.reloadPlanTasksFromRemote).toHaveBeenCalledWith(suspect, { silent: true })
  })
})
