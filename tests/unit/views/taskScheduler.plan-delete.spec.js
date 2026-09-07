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

jest.mock('@/utils/schedulerStorage', () => ({
  getDefaultSchedulerData: jest.fn(() => ({ plans: [], broadcasts: [], livecasts: [] })),
  getDefaultSchedulerDrafts: jest.fn(() => ({ plans: [], planDirtyIds: [], planDeletedIds: [], planBaseSnapshot: [], dirtyScopes: [] })),
  loadSchedulerDrafts: jest.fn(() => ({ plans: [], planDirtyIds: [], planDeletedIds: [], planBaseSnapshot: [], dirtyScopes: [] })),
  savePlanDraft: jest.fn((plans, dirtyIds, baseSnapshot, options = {}) => ({
    plans,
    planDirtyIds: dirtyIds,
    planDeletedIds: options.planDeletedIds || [],
    planBaseSnapshot: baseSnapshot,
    dirtyScopes: (dirtyIds.length || (options.planDeletedIds || []).length) ? ['plans'] : [],
    updatedAt: '2026-03-20T00:00:00'
  }))
}))

import { deleteScheduleEntry } from '@/api/dataService'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

const vueSet = (obj, key, val) => { obj[key] = val }
const vueDelete = (obj, key) => { delete obj[key] }

function makeCtx(overrides = {}) {
  const plans = overrides.plans || [
    { id: 'plan-1', name: '夏季作息', originName: '夏季作息', isNew: false, tasks: [], tasksLoaded: true },
    { id: 'plan-2', name: '冬季作息', originName: '冬季作息', isNew: false, tasks: [], tasksLoaded: true }
  ]
  return {
    busyActionKey: '',
    hasPlanDraft: overrides.hasPlanDraft || false,
    draftState: overrides.draftState || { plans: [], planDirtyIds: [], planDeletedIds: [], planBaseSnapshot: [] },
    lastSyncedPlans: overrides.lastSyncedPlans || JSON.parse(JSON.stringify(plans)),
    modules: { plans },
    $set: vueSet,
    $delete: vueDelete,
    $message: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
    // real helpers used by deletePlansImmediate
    clonePlanList: (list) => JSON.parse(JSON.stringify(list || [])),
    stripOnceEphemeralPlanTasks: (tasks) => tasks,
    preparePlanRows: methods.preparePlanRows,
    buildPlanBaseSnapshot: methods.buildPlanBaseSnapshot,
    normalizePlanDraftIds: (list) => (Array.isArray(list) ? list.map((i) => String(i)).filter((i) => i) : []),
    runBusyAction: methods.runBusyAction,
    planSaveError: methods.planSaveError,
    stopRuntimePlayPolling: jest.fn(),
    // mocked downstream reconciliation (asserted separately against the real fn)
    syncPlanDraftWithOfficialState: jest.fn()
  }
}

describe('TaskSchedulerPage immediate plan deletion (T09)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('deletes selected remote plans immediately via deleteScheduleEntry', async() => {
    deleteScheduleEntry.mockResolvedValue({ status: 'ok' })
    const ctx = makeCtx()
    const rows = [ctx.modules.plans[0]]

    const result = await methods.deletePlansImmediate.call(ctx, rows)

    expect(result).toBe(true)
    expect(deleteScheduleEntry).toHaveBeenCalledTimes(1)
    expect(deleteScheduleEntry).toHaveBeenCalledWith('夏季作息')
    expect(ctx.$message.success).toHaveBeenCalledWith('作息方案已删除')
    expect(ctx.busyActionKey).toBe('') // released
  })

  it('reconciles via syncPlanDraftWithOfficialState with removedIds (never stages a deletedId)', async() => {
    deleteScheduleEntry.mockResolvedValue({ status: 'ok' })
    const ctx = makeCtx()
    const rows = [ctx.modules.plans[0]]

    await methods.deletePlansImmediate.call(ctx, rows)

    expect(ctx.syncPlanDraftWithOfficialState).toHaveBeenCalledTimes(1)
    const [nextOfficial, options] = ctx.syncPlanDraftWithOfficialState.mock.calls[0]
    // the deleted plan is gone from the official snapshot passed downstream
    expect(nextOfficial.map((p) => p.id)).toEqual(['plan-2'])
    expect(options.removedIds).toEqual(['plan-1'])
  })

  it('uses originName for the remote delete when it differs from the display name', async() => {
    deleteScheduleEntry.mockResolvedValue({ status: 'ok' })
    const plans = [
      { id: 'plan-1', name: '夏季作息（改名中）', originName: '夏季作息', isNew: false, tasks: [], tasksLoaded: true }
    ]
    const ctx = makeCtx({ plans })

    await methods.deletePlansImmediate.call(ctx, [plans[0]])

    expect(deleteScheduleEntry).toHaveBeenCalledWith('夏季作息')
  })

  it('keeps rows and surfaces an error when the remote delete fails (pessimistic)', async() => {
    deleteScheduleEntry.mockRejectedValueOnce({ response: { data: { detail: '远端拒绝删除' } } })
    const ctx = makeCtx()
    const rows = [ctx.modules.plans[0]]

    const result = await methods.deletePlansImmediate.call(ctx, rows)

    expect(result).toBe(false)
    // failed plan was not removed from the official snapshot (nothing succeeded)
    expect(ctx.syncPlanDraftWithOfficialState).not.toHaveBeenCalled()
    expect(ctx.$message.error).toHaveBeenCalled()
    expect(ctx.$message.success).not.toHaveBeenCalled()
  })

  it('removes only the succeeded plans on a partial failure', async() => {
    deleteScheduleEntry
      .mockResolvedValueOnce({ status: 'ok' }) // plan-1 ok
      .mockRejectedValueOnce({ response: { data: { detail: '删除失败' } } }) // plan-2 fails
    const ctx = makeCtx()
    const rows = [ctx.modules.plans[0], ctx.modules.plans[1]]

    const result = await methods.deletePlansImmediate.call(ctx, rows)

    expect(result).toBe(false) // there was a failure
    expect(deleteScheduleEntry).toHaveBeenCalledTimes(2)
    // plan-1 succeeded → reconciled out; plan-2 kept
    const [nextOfficial, options] = ctx.syncPlanDraftWithOfficialState.mock.calls[0]
    expect(options.removedIds).toEqual(['plan-1'])
    expect(nextOfficial.map((p) => p.id)).toEqual(['plan-2'])
    expect(ctx.$message.error).toHaveBeenCalled()
  })

  it('drops a brand-new local-only plan without calling the remote', async() => {
    const plans = [
      { id: 'plan-new', name: '草稿方案', originName: '', isNew: true, tasks: [], tasksLoaded: true }
    ]
    const ctx = makeCtx({ plans })

    const result = await methods.deletePlansImmediate.call(ctx, [plans[0]])

    expect(result).toBe(true)
    expect(deleteScheduleEntry).not.toHaveBeenCalled()
    expect(ctx.syncPlanDraftWithOfficialState).toHaveBeenCalledTimes(1)
    expect(ctx.syncPlanDraftWithOfficialState.mock.calls[0][1].removedIds).toEqual(['plan-new'])
  })

  it('does nothing when no rows are selected', async() => {
    const ctx = makeCtx()
    const result = await methods.deletePlansImmediate.call(ctx, [])
    expect(result).toBe(false)
    expect(deleteScheduleEntry).not.toHaveBeenCalled()
    expect(ctx.$message.warning).toHaveBeenCalledWith('请选择要删除的行')
  })
})

describe('syncPlanDraftWithOfficialState badge consistency (T09)', () => {
  it('drops removed ids from planDirtyIds/planDeletedIds and never increments deletedIds', () => {
    const officialPlans = [
      { id: 'plan-2', name: '冬季作息', originName: '冬季作息', isNew: false, tasks: [], tasksLoaded: true }
    ]
    // Pre-existing draft: plan-3 is a dirty (edited) plan; no plans pending delete.
    const ctx = {
      hasPlanDraft: true,
      draftState: {
        plans: [
          { id: 'plan-2', name: '冬季作息', originName: '冬季作息', isNew: false, tasks: [], tasksLoaded: true },
          { id: 'plan-3', name: '春季作息', originName: '春季作息', isNew: false, tasks: [], tasksLoaded: true }
        ],
        planDirtyIds: ['plan-3'],
        planDeletedIds: [],
        planBaseSnapshot: []
      },
      lastSyncedPlans: [],
      $set: vueSet,
      $delete: vueDelete,
      clonePlanList: (list) => JSON.parse(JSON.stringify(list || [])),
      stripOnceEphemeralPlanTasks: (tasks) => tasks,
      preparePlanRows: methods.preparePlanRows,
      buildPlanBaseSnapshot: methods.buildPlanBaseSnapshot,
      normalizePlanDraftIds: (list) => (Array.isArray(list) ? list.map((i) => String(i)).filter((i) => i) : []),
      setPlanRows: jest.fn(),
      savePlanDraftState: jest.fn(),
      clearPlanDraftState: jest.fn(),
      findPlanIndexById: (list, id) => list.findIndex((p) => String(p.id) === String(id))
    }

    methods.syncPlanDraftWithOfficialState.call(ctx, officialPlans, { removedIds: ['plan-1'] })

    // dirty plan-3 still present → draft is kept (not cleared)
    expect(ctx.savePlanDraftState).toHaveBeenCalledTimes(1)
    const [, dirtyIds, , options] = ctx.savePlanDraftState.mock.calls[0]
    expect(dirtyIds).toEqual(['plan-3'])
    // crucial: deletedIds did NOT grow because of the delete (still empty)
    expect(options.planDeletedIds).toEqual([])
  })
})
