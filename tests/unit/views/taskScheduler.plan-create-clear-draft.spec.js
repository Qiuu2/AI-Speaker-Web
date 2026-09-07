// 修2 / T47 Option 1 (guarded): an immediate plan create must clear a stale
// plan draft that survived from a prior session (otherwise the "未上传草稿"
// badge + the draft-overlay rows persist after the create refresh). The clear
// is guarded exactly like the broadcast side (_canClearBroadcastDraftAfterImmediateCommit,
// KP #22 r2): it must NEVER swallow another plan's pending staging.
//
// Because both the badge (hasPlanDraft) and the overlay rows derive from the
// SAME persisted draftState (planDirtyIds / dirtyScopes / plans), clearing
// draftState collapses both forms — the two [UNVERIFIED] symptoms in the T47
// report (badge vs overlay) are covered by the single state clear.

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
    ...actual,
    loadSchedulerDrafts: jest.fn(() => actual.getDefaultSchedulerDrafts())
  }
})

import { createScheduleEntry } from '@/api/dataService'
import { hasSchedulerDirtyScope } from '@/utils/schedulerStorage'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

// draftState seeded with a plans-scope dirty residue, simulating a stale draft
// left over from a prior session.
function draftWith({ dirtyIds = [], deletedIds = [] } = {}) {
  return {
    plans: dirtyIds.map((id) => ({ id: String(id), name: `方案-${id}` })),
    planDirtyIds: dirtyIds.map(String),
    planDeletedIds: deletedIds.map(String),
    planBaseSnapshot: [],
    dirtyScopes: (dirtyIds.length || deletedIds.length) ? ['plans'] : []
  }
}

describe('修2 _canClearPlanDraftAfterImmediateCreate — own-scope guard', () => {
  function guardCtx(draftState) {
    return { draftState }
  }

  it('allows clear when there is no residue at all', () => {
    const ctx = guardCtx(draftWith({}))
    expect(methods._canClearPlanDraftAfterImmediateCreate.call(ctx, '美国作息')).toBe(true)
  })

  it('refuses clear when another plan is pending dirty (KP #22 r2 反例)', () => {
    const ctx = guardCtx(draftWith({ dirtyIds: ['夏季作息'] }))
    expect(methods._canClearPlanDraftAfterImmediateCreate.call(ctx, '美国作息')).toBe(false)
  })

  it('refuses clear when any plan delete is pending (delete is batch-natured)', () => {
    const ctx = guardCtx(draftWith({ deletedIds: ['旧方案'] }))
    expect(methods._canClearPlanDraftAfterImmediateCreate.call(ctx, '美国作息')).toBe(false)
  })

  it('allows clear when the only dirty id is the just-created plan itself', () => {
    const ctx = guardCtx(draftWith({ dirtyIds: ['美国作息'] }))
    expect(methods._canClearPlanDraftAfterImmediateCreate.call(ctx, '美国作息')).toBe(true)
  })

  it('refuses clear with no createdId when residue exists (cannot prove ownership)', () => {
    const ctx = guardCtx(draftWith({ dirtyIds: ['夏季作息'] }))
    expect(methods._canClearPlanDraftAfterImmediateCreate.call(ctx, '')).toBe(false)
  })
})

describe('修2 clearStalePlanDraftAfterCreate — guarded clear of stale draft', () => {
  function clearCtx(draftState) {
    return {
      draftState,
      _canClearPlanDraftAfterImmediateCreate: methods._canClearPlanDraftAfterImmediateCreate,
      clearPlanDraftState: methods.clearPlanDraftState
    }
  }

  it('clears a stale plan draft (badge + overlay both gone) when safe', () => {
    // A stale draft from a prior session: a plan dirty id that happens to be the
    // one we just created (or pure residue). After clear, no plans dirty scope.
    const ctx = clearCtx(draftWith({ dirtyIds: ['美国作息'] }))
    expect(hasSchedulerDirtyScope('plans', ctx.draftState)).toBe(true)

    methods.clearStalePlanDraftAfterCreate.call(ctx, '美国作息')

    expect(hasSchedulerDirtyScope('plans', ctx.draftState)).toBe(false)
    expect(ctx.draftState.planDirtyIds).toEqual([])
    expect(ctx.draftState.plans).toEqual([])
  })

  it('does NOT clear when another plan has pending staging (reverse-truth: staging survives)', () => {
    const ctx = clearCtx(draftWith({ dirtyIds: ['夏季作息'] }))

    methods.clearStalePlanDraftAfterCreate.call(ctx, '美国作息')

    // staging preserved — the badge keeps showing, nothing swallowed
    expect(hasSchedulerDirtyScope('plans', ctx.draftState)).toBe(true)
    expect(ctx.draftState.planDirtyIds).toEqual(['夏季作息'])
  })

  it('is a no-op when there is no plan draft to clear', () => {
    const ctx = clearCtx(draftWith({}))
    const spy = jest.spyOn(ctx, 'clearPlanDraftState')

    methods.clearStalePlanDraftAfterCreate.call(ctx, '美国作息')

    expect(spy).not.toHaveBeenCalled()
  })
})

describe('修2 create paths invoke the guarded clear', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('UI createPlanImmediate clears a stale plan draft after a successful create', async() => {
    createScheduleEntry.mockResolvedValue({})
    const ctx = {
      persisting: false,
      draftState: draftWith({ dirtyIds: ['美国作息'] }),
      $message: { success: jest.fn(), warning: jest.fn(), error: jest.fn() },
      loadModules: jest.fn().mockResolvedValue(undefined),
      planSaveError: jest.fn(),
      _canClearPlanDraftAfterImmediateCreate: methods._canClearPlanDraftAfterImmediateCreate,
      clearStalePlanDraftAfterCreate: methods.clearStalePlanDraftAfterCreate,
      clearPlanDraftState: methods.clearPlanDraftState
    }

    const ok = await methods.createPlanImmediate.call(ctx, '美国作息')

    expect(ok).toBe(true)
    expect(createScheduleEntry).toHaveBeenCalledWith({ schedule_name: '美国作息' })
    expect(ctx.loadModules).toHaveBeenCalledTimes(1)
    expect(hasSchedulerDirtyScope('plans', ctx.draftState)).toBe(false)
  })

  it('UI createPlanImmediate does NOT swallow another plan staging on create', async() => {
    createScheduleEntry.mockResolvedValue({})
    const ctx = {
      persisting: false,
      draftState: draftWith({ dirtyIds: ['夏季作息'] }),
      $message: { success: jest.fn(), warning: jest.fn(), error: jest.fn() },
      loadModules: jest.fn().mockResolvedValue(undefined),
      planSaveError: jest.fn(),
      _canClearPlanDraftAfterImmediateCreate: methods._canClearPlanDraftAfterImmediateCreate,
      clearStalePlanDraftAfterCreate: methods.clearStalePlanDraftAfterCreate,
      clearPlanDraftState: methods.clearPlanDraftState
    }

    await methods.createPlanImmediate.call(ctx, '美国作息')

    expect(ctx.draftState.planDirtyIds).toEqual(['夏季作息'])
    expect(hasSchedulerDirtyScope('plans', ctx.draftState)).toBe(true)
  })

  it('AI handleAssistantRefresh clears a stale plan draft on create_schedule intent', async() => {
    const ctx = {
      draftState: draftWith({ dirtyIds: ['美国作息'] }),
      activeTab: 'plans',
      loadModules: jest.fn().mockResolvedValue(undefined),
      applySchedulePayloadToModules: jest.fn(),
      applyAssistantRuntimePlayPreview: jest.fn(),
      loadRuntimePlays: jest.fn(),
      loadBroadcasts: jest.fn(),
      loadLivecasts: jest.fn(),
      assistantCreatedPlanName: methods.assistantCreatedPlanName,
      clearStalePlanDraftAfterCreate: methods.clearStalePlanDraftAfterCreate,
      _canClearPlanDraftAfterImmediateCreate: methods._canClearPlanDraftAfterImmediateCreate,
      clearPlanDraftState: methods.clearPlanDraftState
    }

    methods.handleAssistantRefresh.call(ctx, {
      intent: 'create_schedule',
      slots: { schedule_name: '美国作息' },
      schedules: { schedules: [] }
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(hasSchedulerDirtyScope('plans', ctx.draftState)).toBe(false)
  })

  it('AI handleAssistantRefresh does NOT clear on a non-create intent', async() => {
    const ctx = {
      draftState: draftWith({ dirtyIds: ['美国作息'] }),
      activeTab: 'plans',
      loadModules: jest.fn().mockResolvedValue(undefined),
      applySchedulePayloadToModules: jest.fn(),
      applyAssistantRuntimePlayPreview: jest.fn(),
      loadRuntimePlays: jest.fn(),
      loadBroadcasts: jest.fn(),
      loadLivecasts: jest.fn(),
      assistantCreatedPlanName: methods.assistantCreatedPlanName,
      clearStalePlanDraftAfterCreate: methods.clearStalePlanDraftAfterCreate,
      _canClearPlanDraftAfterImmediateCreate: methods._canClearPlanDraftAfterImmediateCreate,
      clearPlanDraftState: methods.clearPlanDraftState
    }

    methods.handleAssistantRefresh.call(ctx, {
      intent: 'adjust_volume',
      slots: {},
      schedules: { schedules: [] }
    })
    await Promise.resolve()
    await Promise.resolve()

    // non-create intent must leave the draft intact
    expect(hasSchedulerDirtyScope('plans', ctx.draftState)).toBe(true)
  })
})
