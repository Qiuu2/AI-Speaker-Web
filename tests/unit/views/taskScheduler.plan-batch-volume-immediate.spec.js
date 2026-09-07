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

function makePlan(name, taskCount) {
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

function makeCtx(plans, batchVolume = 79) {
  return {
    persisting: false,
    batchDialog: { visible: true, volume: batchVolume, status: '' },
    $set: vueSet,
    $delete: vueDelete,
    $message: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
    getSelected: jest.fn(() => plans),
    getPlanDraftSourcePlans: jest.fn(() => Promise.resolve(plans)),
    clonePlanList: (list) => JSON.parse(JSON.stringify(list)),
    findPlanIndexById: methods.findPlanIndexById,
    persistPlanDraftLocally: jest.fn(() => Promise.resolve()),
    hasPlanDraft: false,
    draftState: { planBaseSnapshot: [] },
    applyImmediatePlanStatus: jest.fn(() => Promise.resolve(true)),
    serializePlanForApi: methods.serializePlanForApi,
    buildScheduleFromPlan: methods.buildScheduleFromPlan,
    stripOnceEphemeralPlanTasks: (tasks) => tasks || [],
    buildScheduleTaskFromPlan: jest.fn((task) => task),
    applyPlanState: jest.fn(),
    planSaveError: jest.fn(),
    loadModules: jest.fn(() => Promise.resolve()),
    modules: { plans: [] },
    openBatchVolumeProgress: methods.openBatchVolumeProgress,
    submitBatch: methods.submitBatch
  }
}

describe('TaskSchedulerPage submitBatch volume (T39 Step 1 B parallel)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('fans out updateScheduleEntry in parallel and pushes the new volume into every task of every selected plan', async() => {
    const plans = [makePlan('日本作息', 2), makePlan('海星作息', 3), makePlan('测试', 1)]
    updateScheduleEntry.mockResolvedValue({ status: 'ok' })
    const ctx = makeCtx(plans, 79)

    const t0 = Date.now()
    await ctx.submitBatch.call(ctx)

    expect(updateScheduleEntry).toHaveBeenCalledTimes(3)
    // names hit by the URL match the originalName of each selected plan
    const calledNames = updateScheduleEntry.mock.calls.map(([originalName]) => originalName).sort()
    expect(calledNames).toEqual(['日本作息', '海星作息', '测试'].sort())
    // each payload carries the new volume on every task
    updateScheduleEntry.mock.calls.forEach(([, payload]) => {
      payload.tasks.forEach((task) => expect(task.volume).toBe(79))
    })
    expect(ctx.persistPlanDraftLocally).not.toHaveBeenCalled()
    expect(ctx.$message.success).toHaveBeenCalledWith('任务音量已更新')
    expect(ctx.batchDialog.visible).toBe(false)
    // sanity that we did not block the event loop for sequential awaits — this
    // is not a precise timing assertion, just confirming no obvious serial
    // wait artefact in the mock world.
    expect(Date.now() - t0).toBeLessThan(2000)
  })

  it('collects per-plan failures via planSaveError + reloads modules instead of leaving the UI half-applied', async() => {
    const plans = [makePlan('日本作息', 2), makePlan('海星作息', 2), makePlan('测试', 2)]
    updateScheduleEntry
      .mockResolvedValueOnce({ status: 'ok' })
      .mockRejectedValueOnce(new Error('海星作息 PUT 500'))
      .mockResolvedValueOnce({ status: 'ok' })
    const ctx = makeCtx(plans, 79)

    await ctx.submitBatch.call(ctx)

    expect(updateScheduleEntry).toHaveBeenCalledTimes(3)
    expect(ctx.planSaveError).toHaveBeenCalledTimes(1)
    expect(ctx.loadModules).toHaveBeenCalledTimes(1)
    expect(ctx.$message.success).not.toHaveBeenCalled()
    expect(ctx.applyPlanState).not.toHaveBeenCalled()
  })

  it('refuses to fan out when every selected plan is brand-new local (isNew)', async() => {
    const plans = [
      { id: 'p1', name: '本地A', originName: '', isNew: true, status: '启用', tasks: [] },
      { id: 'p2', name: '本地B', originName: '', isNew: true, status: '启用', tasks: [] }
    ]
    const ctx = makeCtx(plans, 79)

    await ctx.submitBatch.call(ctx)

    expect(updateScheduleEntry).not.toHaveBeenCalled()
    expect(ctx.$message.warning).toHaveBeenCalledWith('选中的方案还未上传到远端，无法批量修改音量')
  })

  it('forwards Promise.allSettled rejection reason verbatim to planSaveError (first rejection wins)', async() => {
    const plans = [makePlan('日本作息', 1), makePlan('海星作息', 1)]
    const firstErr = new Error('first error')
    updateScheduleEntry
      .mockRejectedValueOnce(firstErr)
      .mockRejectedValueOnce(new Error('second error'))
    const ctx = makeCtx(plans, 79)

    await ctx.submitBatch.call(ctx)

    expect(ctx.planSaveError).toHaveBeenCalledTimes(1)
    expect(ctx.planSaveError.mock.calls[0][0]).toBe(firstErr)
  })
})

// T48 P1: live "已调 X/N" progress notice during the batch volume fan-out.
describe('TaskSchedulerPage submitBatch volume progress notice (T48 P1)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // A callable $message that records the persistent (duration:0) instance so we
  // can read its live-updated text, plus the usual .success/.warning helpers.
  function progressCtx(plans, batchVolume = 79) {
    const fakeInstance = { message: '', closed: false, close() { this.closed = true } }
    const messageFn = jest.fn(() => fakeInstance)
    messageFn.success = jest.fn()
    messageFn.warning = jest.fn()
    messageFn.error = jest.fn()
    messageFn.info = jest.fn()
    const ctx = makeCtx(plans, batchVolume)
    ctx.$message = messageFn
    ctx.__instance = fakeInstance
    return ctx
  }

  it('opens an "已调 0/N" notice, updates it as plans settle, and closes it at the end', async() => {
    const plans = [makePlan('日本作息', 1), makePlan('海星作息', 1), makePlan('测试', 1)]
    updateScheduleEntry.mockResolvedValue({ status: 'ok' })
    const ctx = progressCtx(plans, 79)

    await ctx.submitBatch.call(ctx)

    // a persistent notice was opened with the initial 0/3 text
    expect(ctx.$message).toHaveBeenCalledTimes(1)
    expect(ctx.$message.mock.calls[0][0]).toMatchObject({ duration: 0 })
    expect(ctx.$message.mock.calls[0][0].message).toContain('已调 0/3')
    // after all settled, the live text reached 3/3 and the notice was closed
    expect(ctx.__instance.message).toContain('已调 3/3')
    expect(ctx.__instance.closed).toBe(true)
    expect(ctx.$message.success).toHaveBeenCalledWith('任务音量已更新')
  })

  it('still surfaces a failure (progress text does NOT swallow the error path)', async() => {
    const plans = [makePlan('日本作息', 1), makePlan('海星作息', 1)]
    updateScheduleEntry
      .mockResolvedValueOnce({ status: 'ok' })
      .mockRejectedValueOnce(new Error('海星作息 PUT 500'))
    const ctx = progressCtx(plans, 79)

    await ctx.submitBatch.call(ctx)

    // both settled (counter reached 2/2) but the rejection still went to
    // planSaveError + loadModules, and no success toast fired
    expect(ctx.__instance.message).toContain('已调 2/2')
    expect(ctx.__instance.closed).toBe(true)
    expect(ctx.planSaveError).toHaveBeenCalledTimes(1)
    expect(ctx.loadModules).toHaveBeenCalledTimes(1)
    expect(ctx.$message.success).not.toHaveBeenCalled()
  })
})
