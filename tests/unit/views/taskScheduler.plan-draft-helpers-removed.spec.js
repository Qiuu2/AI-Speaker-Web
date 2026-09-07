// 笔 7a-4: dead plan-draft helpers removed.
// persistPlanDraftLocally and _buildPendingOverwritePayloadLegacy are no
// longer reachable from any UI surface after Step 1 A/B/2 D/笔 7a-1/2/3,
// so they are gone from the component definition.
// savePlanDraftState / uploadPlanDrafts / buildPendingOverwritePayload remain
// because they are still wired into reconcile paths (syncPlanDraftWith
// OfficialState, confirmSaveBeforePlanStatus, persist pendingOnly broadcast
// path); they only execute when hasPlanDraft is truthy, which legacy
// localStorage state can still produce until the user picks "立即上传 / 丢弃".

import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

describe('T39 笔 7a-4 dead plan-draft helpers removed', () => {
  it('persistPlanDraftLocally is no longer defined on the component', () => {
    expect(methods.persistPlanDraftLocally).toBeUndefined()
  })

  it('_buildPendingOverwritePayloadLegacy is no longer defined on the component', () => {
    expect(methods._buildPendingOverwritePayloadLegacy).toBeUndefined()
  })

  it('savePlanDraftState stays defined (used by reconcile paths that still run for legacy drafts)', () => {
    expect(typeof methods.savePlanDraftState).toBe('function')
  })

  it('uploadPlanDrafts stays defined (used by confirmSaveBeforePlanStatus pre-flight)', () => {
    expect(typeof methods.uploadPlanDrafts).toBe('function')
  })

  it('buildPendingOverwritePayload stays defined (used by persist pendingOnly broadcast path)', () => {
    expect(typeof methods.buildPendingOverwritePayload).toBe('function')
  })
})
