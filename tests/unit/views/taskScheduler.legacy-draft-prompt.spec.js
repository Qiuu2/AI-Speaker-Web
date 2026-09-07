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
  getDefaultSchedulerDrafts: jest.fn(() => ({ plans: [], planDirtyIds: [], planBaseSnapshot: [], dirtyScopes: [] })),
  loadSchedulerDrafts: jest.fn(() => ({ plans: [], planDirtyIds: [], planBaseSnapshot: [], dirtyScopes: [] }))
}))

import { updateScheduleEntry } from '@/api/dataService'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

const vueSet = (obj, key, val) => { obj[key] = val }
const vueDelete = (obj, key) => { delete obj[key] }

function makePlan(name, taskCount = 1) {
  return {
    id: `plan-${name}`,
    name,
    originName: name,
    isNew: false,
    status: '启用',
    tasks: Array.from({ length: taskCount }, (_, i) => ({
      id: `${name}-task-${i}`,
      taskid: String(70000 + i),
      time: `08:0${i}:00`,
      audio: '上课铃.mp3',
      volume: 80
    }))
  }
}

function makeCtx(overrides = {}) {
  const draftPlans = overrides.draftPlans || [makePlan('日本作息'), makePlan('海星作息')]
  const planDirtyIds = draftPlans.map((p) => String(p.id))
  return {
    legacyPlanDraftPromptShown: false,
    hasPlanDraft: overrides.hasPlanDraft !== undefined ? overrides.hasPlanDraft : true,
    planDraftCount: overrides.planDraftCount !== undefined ? overrides.planDraftCount : draftPlans.length,
    persisting: false,
    draftState: { plans: draftPlans, planDirtyIds, planBaseSnapshot: [] },
    $set: vueSet,
    $delete: vueDelete,
    $message: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
    $confirm: overrides.confirm || jest.fn(() => Promise.resolve()),
    clearPlanDraftState: jest.fn(),
    loadModules: jest.fn(() => Promise.resolve()),
    planSaveError: jest.fn(),
    normalizePlanDraftIds: (ids) => (Array.isArray(ids) ? ids.map((id) => String(id || '')).filter(Boolean) : []),
    findPlanIndexById: methods.findPlanIndexById,
    serializePlanForApi: methods.serializePlanForApi,
    buildScheduleFromPlan: methods.buildScheduleFromPlan,
    stripOnceEphemeralPlanTasks: (tasks) => tasks || [],
    buildScheduleTaskFromPlan: jest.fn((task) => task),
    modules: { plans: [] },
    promptLegacyPlanDraftMigration: methods.promptLegacyPlanDraftMigration,
    uploadLegacyPlanDraftsParallel: methods.uploadLegacyPlanDraftsParallel
  }
}

describe('TaskSchedulerPage promptLegacyPlanDraftMigration (T39 Step 3 b → 7a-1 fan-out)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('skips silently when there is no plan draft to migrate', async() => {
    const ctx = makeCtx({ hasPlanDraft: false, planDraftCount: 0 })
    await ctx.promptLegacyPlanDraftMigration.call(ctx)
    expect(ctx.$confirm).not.toHaveBeenCalled()
    expect(updateScheduleEntry).not.toHaveBeenCalled()
    expect(ctx.clearPlanDraftState).not.toHaveBeenCalled()
  })

  it('discards the legacy draft when the user cancels', async() => {
    const ctx = makeCtx({ confirm: jest.fn(() => Promise.reject('cancel')) })
    await ctx.promptLegacyPlanDraftMigration.call(ctx)
    expect(ctx.clearPlanDraftState).toHaveBeenCalledTimes(1)
    expect(updateScheduleEntry).not.toHaveBeenCalled()
    expect(ctx.$message.info).toHaveBeenCalledWith('已丢弃旧版作息方案草稿')
  })

  it('uploads remote-backed legacy drafts via parallel updateScheduleEntry (fan-out, not savePendingChanges)', async() => {
    updateScheduleEntry.mockResolvedValue({ status: 'ok' })
    const ctx = makeCtx({ confirm: jest.fn(() => Promise.resolve()) })

    await ctx.promptLegacyPlanDraftMigration.call(ctx)

    expect(ctx.$confirm).toHaveBeenCalledTimes(1)
    expect(updateScheduleEntry).toHaveBeenCalledTimes(2)
    const names = updateScheduleEntry.mock.calls.map(([originalName]) => originalName).sort()
    expect(names).toEqual(['日本作息', '海星作息'].sort())
    expect(ctx.clearPlanDraftState).toHaveBeenCalledTimes(1)
    expect(ctx.loadModules).toHaveBeenCalled()
    expect(ctx.$message.success).toHaveBeenCalledWith('旧版作息方案草稿已上传')
  })

  it('surfaces per-plan failures via planSaveError + loadModules (Promise.allSettled, no half-applied state)', async() => {
    updateScheduleEntry
      .mockResolvedValueOnce({ status: 'ok' })
      .mockRejectedValueOnce(new Error('海星作息 500'))
    const ctx = makeCtx({ confirm: jest.fn(() => Promise.resolve()) })

    await ctx.promptLegacyPlanDraftMigration.call(ctx)

    expect(updateScheduleEntry).toHaveBeenCalledTimes(2)
    expect(ctx.planSaveError).toHaveBeenCalledTimes(1)
    expect(ctx.loadModules).toHaveBeenCalled()
    expect(ctx.$message.success).not.toHaveBeenCalled()
    expect(ctx.clearPlanDraftState).not.toHaveBeenCalled()
  })

  it('fail-louds isNew local-only drafts (cannot create from draft) but still uploads the remote ones', async() => {
    const localOnly = {
      id: 'plan-local-X',
      name: '本地未上传',
      originName: '',
      isNew: true,
      status: '启用',
      tasks: []
    }
    const remote = makePlan('日本作息')
    updateScheduleEntry.mockResolvedValue({ status: 'ok' })
    const ctx = makeCtx({ draftPlans: [localOnly, remote], confirm: jest.fn(() => Promise.resolve()) })

    await ctx.promptLegacyPlanDraftMigration.call(ctx)

    expect(ctx.$message.warning).toHaveBeenCalledWith('已忽略 1 个未上传的本地新建草稿，请通过"新建方案"重新创建')
    expect(updateScheduleEntry).toHaveBeenCalledTimes(1)
    expect(updateScheduleEntry.mock.calls[0][0]).toBe('日本作息')
  })

  it('only fires once per mount even if loadDraftState is replayed', async() => {
    updateScheduleEntry.mockResolvedValue({ status: 'ok' })
    const ctx = makeCtx({ confirm: jest.fn(() => Promise.resolve()) })
    await ctx.promptLegacyPlanDraftMigration.call(ctx)
    await ctx.promptLegacyPlanDraftMigration.call(ctx)
    expect(ctx.$confirm).toHaveBeenCalledTimes(1)
    expect(updateScheduleEntry).toHaveBeenCalledTimes(2)
  })
})
