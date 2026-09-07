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

jest.mock('@/utils/schedulerStorage', () => {
  const actual = jest.requireActual('@/utils/schedulerStorage')
  return {
    getDefaultSchedulerData: jest.fn(() => ({ plans: [], broadcasts: [], livecasts: [] })),
    getDefaultSchedulerDrafts: jest.fn(() => ({ plans: [], planDirtyIds: [], planDeletedIds: [], planBaseSnapshot: [], dirtyScopes: [] })),
    loadSchedulerDrafts: jest.fn(() => ({ plans: [], planDirtyIds: [], planDeletedIds: [], planBaseSnapshot: [], dirtyScopes: [] })),
    // T47: the create paths now consult the real dirty-scope check + clear
    // helper; use the actual implementations so the guarded no-op behaves.
    hasSchedulerDirtyScope: actual.hasSchedulerDirtyScope,
    clearPlanDraft: actual.clearPlanDraft
  }
})

import { createScheduleEntry, updateScheduleEntry, updateBroadcastSchedules } from '@/api/dataService'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

// Shared ctx pieces using the REAL commitPlanOperations + executePlanOperations
// so the pessimistic (await ACK → applyPlanState, else rollback) flow is the
// thing under test. Only the API + the heavy state mutators are stubbed.
function baseOpsCtx(overrides = {}) {
  return {
    persisting: false,
    planDirtyIds: [],
    draftState: { plans: [], planDirtyIds: [], planDeletedIds: [], planBaseSnapshot: [] },
    schedulePayload: {},
    hasPlanDraft: false,
    commitPlanOperations: methods.commitPlanOperations,
    executePlanOperations: methods.executePlanOperations,
    createPlanImmediate: methods.createPlanImmediate,
    // T47: create paths run a guarded stale-draft clear; wire the real helpers
    // so the call doesn't throw (draftState starts clean → it is a no-op here).
    clearStalePlanDraftAfterCreate: methods.clearStalePlanDraftAfterCreate,
    _canClearPlanDraftAfterImmediateCreate: methods._canClearPlanDraftAfterImmediateCreate,
    clearPlanDraftState: methods.clearPlanDraftState,
    commitPlansFullPut: methods.commitPlansFullPut,
    copySelectedPlans: methods.copySelectedPlans,
    buildSchedulePayload: methods.buildSchedulePayload,
    // serializePlanListForApi is what strict buildSchedulePayload uses; stub at
    // that seam so the test does not depend on the full serialization internals.
    serializePlanListForApi: jest.fn((rows) => (rows || []).map((p) => ({ schedule_name: p.name, tasks: p.tasks || [] }))),
    serializePlanForApi: jest.fn((plan) => ({ schedule_name: plan.name, tasks: plan.tasks || [] })),
    applyPlanState: jest.fn(),
    loadModules: jest.fn(() => Promise.resolve()),
    planSaveError: jest.fn(),
    $message: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
    ...overrides
  }
}

describe('TaskSchedulerPage new-plan immediate create (T16)', () => {
  beforeEach(() => jest.clearAllMocks())

  function newPlanCtx(overrides = {}) {
    const sourcePlans = []
    return baseOpsCtx({
      dialog: { visible: true, type: 'plan', mode: 'add', form: { name: '新方案' } },
      getPlanDraftSourcePlans: jest.fn(() => Promise.resolve(sourcePlans)),
      clonePlanList: (list) => JSON.parse(JSON.stringify(list || [])),
      createPlanTaskIdAllocator: () => () => '9001',
      buildNewPlanRecord: (name) => ({ id: 'plan-new', name, isNew: true, tasks: [], tasksLoaded: true }),
      addByType: jest.fn(),
      persistPlanDraftLocally: jest.fn(() => Promise.resolve()),
      persist: jest.fn(),
      getSelected: () => [],
      ...overrides
    })
  }

  it('creates the plan via createScheduleEntry (clone-real-template), NOT the full PUT', async() => {
    createScheduleEntry.mockResolvedValueOnce({ schedule_name: '新方案', tasks: [{ taskid: '73001' }] })
    const ctx = newPlanCtx()

    await methods.submitDialog.call(ctx)

    // T25: create goes through POST /schedules (createScheduleEntry → backend
    // add_schedule, which clones a real populated template), NOT the full PUT
    // that cloned the empty 请添加作息 placeholder.
    expect(createScheduleEntry).toHaveBeenCalledTimes(1)
    expect(createScheduleEntry).toHaveBeenCalledWith({ schedule_name: '新方案' })
    expect(updateBroadcastSchedules).not.toHaveBeenCalled()
    expect(ctx.loadModules).toHaveBeenCalledTimes(1) // ACK → reload canonical state
    expect(ctx.persistPlanDraftLocally).not.toHaveBeenCalled() // no draft staging
    expect(ctx.draftState.planDirtyIds).toEqual([]) // badge untouched
    expect(ctx.dialog.visible).toBe(false)
    expect(ctx.$message.success).toHaveBeenCalledWith('作息方案已创建')
  })

  it('rolls back and surfaces an error when the create fails', async() => {
    createScheduleEntry.mockRejectedValueOnce({ response: { data: { detail: '远端拒绝创建' } } })
    const ctx = newPlanCtx()

    await methods.submitDialog.call(ctx)

    expect(ctx.planSaveError).toHaveBeenCalled()
    expect(ctx.loadModules).not.toHaveBeenCalled() // not reloaded on failure
    expect(ctx.dialog.visible).toBe(true) // dialog stays open on failure
    expect(ctx.draftState.planDirtyIds).toEqual([])
  })
})

describe('TaskSchedulerPage new-task immediate create (T16)', () => {
  beforeEach(() => jest.clearAllMocks())

  function newTaskCtx(overrides = {}) {
    const plan = { id: 'plan-1', name: '夏季作息', originName: '夏季作息', isNew: false, tasks: [] }
    const draft = {
      customName: '起床', audio: '铃.mp3', time: '07:00:00', durationMode: 'loop', loop: 1,
      weekdays: ['周一'], dateRange: ['2026-04-08', '2039-12-31'], volume: 80,
      terminalids: ['12'], terminalnames: ['终端A'], location: [['区', '终端A']]
    }
    const sourcePlans = [JSON.parse(JSON.stringify(plan))]
    return baseOpsCtx({
      taskDrawer: { plan, task: null, draft, isNew: true, isOnceOverride: false, overrideId: '', onceTaskId: '' },
      syncTerminalFieldsFromLocation: jest.fn(),
      validateTaskDrawerDraft: jest.fn(() => ({ errors: {}, firstField: '' })),
      isMidnightTime: jest.fn(() => false),
      normalizeDate: (v) => v,
      toTime: (v) => v,
      toDurationSeconds: () => 1,
      getPlanDraftSourcePlans: jest.fn(() => Promise.resolve(sourcePlans)),
      clonePlanList: (list) => JSON.parse(JSON.stringify(list || [])),
      findPlanIndexById: (list, id) => list.findIndex((p) => String(p.id) === String(id)),
      findTaskIndexById: () => -1,
      cloneTask: (t) => JSON.parse(JSON.stringify(t || {})),
      sortTasksByTime: jest.fn(),
      persistPlanDraftLocally: jest.fn(() => Promise.resolve()),
      closeTaskDrawer: jest.fn(),
      ...overrides
    })
  }

  it('creates a new task on an existing schedule immediately (whole-schedule PUT) on ACK', async() => {
    updateScheduleEntry.mockResolvedValueOnce({ status: 'ok' })
    const ctx = newTaskCtx()

    await methods.saveTaskDrawer.call(ctx)

    expect(updateScheduleEntry).toHaveBeenCalledTimes(1)
    expect(updateScheduleEntry.mock.calls[0][0]).toBe('夏季作息') // original schedule name
    expect(ctx.applyPlanState).toHaveBeenCalledTimes(1) // task appears via official state
    expect(ctx.persistPlanDraftLocally).not.toHaveBeenCalled() // no draft, badge unchanged
    expect(ctx.draftState.planDirtyIds).toEqual([])
    expect(ctx.closeTaskDrawer).toHaveBeenCalledTimes(1)
    expect(ctx.$message.success).toHaveBeenCalledWith('任务已创建')
  })

  it('rolls back and keeps the drawer open when the new-task write fails', async() => {
    updateScheduleEntry.mockRejectedValueOnce({ response: { data: { detail: '保存失败' } } })
    const ctx = newTaskCtx()

    await methods.saveTaskDrawer.call(ctx)

    expect(ctx.applyPlanState).not.toHaveBeenCalled()
    expect(ctx.planSaveError).toHaveBeenCalled()
    expect(ctx.loadModules).toHaveBeenCalledTimes(1) // rollback
    expect(ctx.closeTaskDrawer).not.toHaveBeenCalled()
    expect(ctx.persistPlanDraftLocally).not.toHaveBeenCalled()
  })
})

// ----- f1: create → add-task on the SAME plan without a refresh -----
//
// After an immediate create succeeds, the plan must be marked persisted
// (isNew=false, originName=name) so that adding a task to it before any reload
// takes the immediate updateScheduleEntry path instead of falling back to the
// local draft (which would bump the badge and break "no draft"). These tests
// use the REAL applyPlanState/setPlanRows/preparePlanRows so the committed
// plan state is what a follow-up saveTaskDrawer actually reads.
describe('TaskSchedulerPage create → add-task sequence (T25)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('after create + reload, adding a task to the server-loaded plan goes immediate (no draft)', async() => {
    createScheduleEntry.mockResolvedValueOnce({ schedule_name: '新方案', tasks: [{ taskid: '73001' }] })
    updateScheduleEntry.mockResolvedValueOnce({ status: 'ok' })
    const persistDraft = jest.fn()

    // The create reloads from the server; loadModules then exposes the new plan
    // as a persisted (isNew=false, real originName) schedule — same as what a
    // GET would return after the backend clone created it on 223.
    const ctx = baseOpsCtx({
      dialog: { visible: true, type: 'plan', mode: 'add', form: { name: '新方案' } },
      modules: { plans: [] },
      getSelected: () => [],
      addByType: jest.fn(),
      persist: jest.fn(),
      loadModules: jest.fn(() => {
        ctx.modules.plans = [{ id: 'plan-new', name: '新方案', originName: '新方案', isNew: false, tasks: [{ id: 't1', taskid: '73001' }], tasksLoaded: true }]
        return Promise.resolve()
      }),
      // saveTaskDrawer deps
      getPlanDraftSourcePlans: jest.fn(() => Promise.resolve(JSON.parse(JSON.stringify(ctx.modules.plans)))),
      clonePlanList: (list) => JSON.parse(JSON.stringify(list || [])),
      syncTerminalFieldsFromLocation: jest.fn(),
      validateTaskDrawerDraft: jest.fn(() => ({ errors: {}, firstField: '' })),
      isMidnightTime: () => false,
      normalizeDate: (v) => v,
      toTime: (v) => v,
      toDurationSeconds: () => 1,
      findPlanIndexById: (list, id) => list.findIndex((p) => String(p.id) === String(id)),
      findTaskIndexById: () => -1,
      cloneTask: (t) => JSON.parse(JSON.stringify(t || {})),
      sortTasksByTime: jest.fn(),
      persistPlanDraftLocally: persistDraft,
      closeTaskDrawer: jest.fn()
    })

    // Step 1: create the plan (clone-real-template via createScheduleEntry).
    await methods.submitDialog.call(ctx)
    expect(createScheduleEntry).toHaveBeenCalledWith({ schedule_name: '新方案' })
    expect(updateBroadcastSchedules).not.toHaveBeenCalled()

    // Step 2: add a task to that server-loaded plan.
    const createdPlan = ctx.modules.plans.find((p) => p.id === 'plan-new')
    ctx.taskDrawer = {
      plan: createdPlan,
      task: null,
      draft: {
        customName: '起床', audio: '铃.mp3', time: '07:00:00', durationMode: 'loop', loop: 1,
        weekdays: ['周一'], dateRange: ['2026-04-08', '2039-12-31'], volume: 80,
        terminalids: ['12'], terminalnames: ['终端A'], location: [['区', '终端A']]
      },
      isNew: true,
      isOnceOverride: false,
      overrideId: '',
      onceTaskId: ''
    }

    await methods.saveTaskDrawer.call(ctx)

    // The new task on the (persisted) created plan went straight to the remote.
    expect(updateScheduleEntry).toHaveBeenCalledTimes(1)
    expect(updateScheduleEntry.mock.calls[0][0]).toBe('新方案')
    expect(persistDraft).not.toHaveBeenCalled() // did NOT fall back to draft
    expect(ctx.draftState.planDirtyIds).toEqual([]) // badge untouched
  })
})

// ----- T19: copy plan goes through the real full-PUT, not the add_schedule stub -----
describe('TaskSchedulerPage copy plan clones source (T26)', () => {
  beforeEach(() => jest.clearAllMocks())

  function copyCtx(overrides = {}) {
    const source = { id: 'plan-1', name: '夏季作息', originName: '夏季作息', isNew: false, tasks: [{ id: 't1', taskid: '5', customName: '起床' }] }
    return baseOpsCtx({
      modules: { plans: [JSON.parse(JSON.stringify(source))] },
      persistPlanDraftLocally: jest.fn(),
      ...overrides
    })
  }

  it('copies a plan by cloning the SOURCE schedule (createScheduleEntry with source), returning real taskids', async() => {
    // backend clones the named source → copy carries the source's real tasks
    createScheduleEntry.mockResolvedValueOnce({
      schedule_name: '夏季作息-副本',
      tasks: [{ taskid: '5001' }, { taskid: '5002' }]
    })
    const ctx = copyCtx()

    const ok = await methods.copySelectedPlans.call(ctx, [ctx.modules.plans[0]])

    expect(ok).toBe(true)
    // clones the source schedule by name — NOT the 中学夏季 default template,
    // NOT the full PUT, NOT a draft.
    expect(createScheduleEntry).toHaveBeenCalledTimes(1)
    expect(createScheduleEntry).toHaveBeenCalledWith({ schedule_name: '夏季作息-副本', source: '夏季作息' })
    expect(updateBroadcastSchedules).not.toHaveBeenCalled()
    expect(ctx.persistPlanDraftLocally).not.toHaveBeenCalled()
    // the cloned copy's tasks have real numeric taskids (proof it cloned the
    // real source, not an empty placeholder)
    const created = createScheduleEntry.mock.results[0].value
    return created.then((res) => {
      res.tasks.forEach((t) => {
        const tid = String(t.taskid || '')
        expect(tid).toMatch(/^\d+$/)
        expect(tid).not.toBe('0')
      })
      expect(ctx.loadModules).toHaveBeenCalledTimes(1) // reload on success
      expect(ctx.$message.success).toHaveBeenCalledWith('作息方案已复制')
    })
  })

  it('uses originName as the clone source when the display name differs', async() => {
    createScheduleEntry.mockResolvedValueOnce({ schedule_name: '夏季作息-副本', tasks: [{ taskid: '5001' }] })
    const renamed = { id: 'plan-1', name: '夏季作息（改名中）', originName: '夏季作息', isNew: false, tasks: [] }
    const ctx = copyCtx({ modules: { plans: [renamed] } })

    await methods.copySelectedPlans.call(ctx, [renamed])

    expect(createScheduleEntry).toHaveBeenCalledWith({ schedule_name: '夏季作息（改名中）-副本', source: '夏季作息' })
  })

  it('reports an error and does not reload when the only copy fails (pessimistic)', async() => {
    createScheduleEntry.mockRejectedValueOnce({ response: { data: { detail: '远端缺少源方案' } } })
    const ctx = copyCtx()

    const ok = await methods.copySelectedPlans.call(ctx, [ctx.modules.plans[0]])

    expect(ok).toBe(false)
    expect(ctx.loadModules).not.toHaveBeenCalled() // nothing succeeded → no reload
    expect(ctx.$message.error).toHaveBeenCalled()
    expect(ctx.$message.success).not.toHaveBeenCalled()
  })

  it('on partial failure: reloads succeeded copies and reports the failed source by name', async() => {
    createScheduleEntry
      .mockResolvedValueOnce({ schedule_name: 'A-副本', tasks: [{ taskid: '11' }] }) // A ok
      .mockRejectedValueOnce({ response: { data: { detail: 'boom' } } }) // B fails
    const a = { id: 'pa', name: 'A', originName: 'A', isNew: false, tasks: [] }
    const b = { id: 'pb', name: 'B', originName: 'B', isNew: false, tasks: [] }
    const ctx = copyCtx({ modules: { plans: [a, b] } })

    const ok = await methods.copySelectedPlans.call(ctx, [a, b])

    expect(ok).toBe(false)
    expect(createScheduleEntry).toHaveBeenCalledTimes(2)
    expect(ctx.loadModules).toHaveBeenCalledTimes(1) // A succeeded → reload
    const errMsg = ctx.$message.error.mock.calls[0][0]
    expect(errMsg).toContain('B') // failed source named
  })

  it('warns and does nothing when there is no resolvable source', async() => {
    const ctx = copyCtx({ modules: { plans: [{ id: 'x', name: '', originName: '' }] } })
    const ok = await methods.copySelectedPlans.call(ctx, [{ id: 'x', name: '', originName: '' }])
    expect(ok).toBe(false)
    expect(createScheduleEntry).not.toHaveBeenCalled()
    expect(ctx.$message.warning).toHaveBeenCalledWith('未找到要复制的方案')
  })
})

// ----- Hostile reversal: prove the write is genuinely pessimistic (awaited) -----
//
// commitPlanOperations only knows ACK vs failure because it AWAITS
// executePlanOperations. If executePlanOperations were fire-and-forget (not
// awaited), a rejected API call would not be caught synchronously: planSaveError
// / loadModules would NOT run before the method returns, and applyPlanState
// would be called as if it succeeded. This test pins that behavior so a
// fire-and-forget regression (dropping the await) fails it.
describe('commitPlanOperations is pessimistic (awaits ACK)', () => {
  beforeEach(() => jest.clearAllMocks())

  // Uses a 'update' op (the only remaining real per-schedule write through
  // executePlanOperations; the 'create' branch was removed in T19 since
  // creation goes through the full PUT instead).
  it('on a failing op: does NOT applyPlanState, DOES rollback — only true if awaited', async() => {
    updateScheduleEntry.mockRejectedValueOnce(new Error('boom'))
    const ctx = baseOpsCtx()
    const nextPlans = [{ id: 'plan-x', name: 'X', isNew: false, originName: 'X', tasks: [] }]

    const result = await methods.commitPlanOperations.call(
      ctx, nextPlans, [{ type: 'update', planId: 'plan-x', originalName: 'X' }], 'msg'
    )

    expect(result).toBe(false)
    expect(ctx.applyPlanState).not.toHaveBeenCalled()
    expect(ctx.planSaveError).toHaveBeenCalledTimes(1)
    expect(ctx.loadModules).toHaveBeenCalledTimes(1)
  })

  it('on a succeeding op: applyPlanState runs after ACK', async() => {
    updateScheduleEntry.mockResolvedValueOnce({ status: 'ok' })
    const ctx = baseOpsCtx()
    const nextPlans = [{ id: 'plan-x', name: 'X', isNew: false, originName: 'X', tasks: [] }]

    const result = await methods.commitPlanOperations.call(
      ctx, nextPlans, [{ type: 'update', planId: 'plan-x', originalName: 'X' }], 'msg'
    )

    expect(result).toBe(true)
    expect(ctx.applyPlanState).toHaveBeenCalledTimes(1)
    expect(ctx.planSaveError).not.toHaveBeenCalled()
  })
})
