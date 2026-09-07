// T62: broadcast inline edit is now a PER-ROW DRAFT model stored OFF the row
// (broadcastRowDrafts, keyed by task id). A cell @change no longer PUTs and no
// longer mutates the modules.broadcasts row — it records the change into the
// off-row draft store; the cell shows the staged value via the broadcastDraftValue
// overlay (critic r1 f1: mutating the row染es the dirty scope → global badge
// false-positive). Clicking 完成 (commitBroadcastRowFinish) packs every staged
// field into ONE commitBroadcastFields PUT then canonical-refills (KP#23); 取消
// (cancelBroadcastRowDraft) just drops the off-row entry (the row was never
// touched, so the overlay reverts).
//
// These tests assert the off-row staging + overlay + the merged finish payload
// (the right layer: outbound dirty_fields + stripped id columns).

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

import { commitBroadcastFields } from '@/api/dataService'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

function makeCtx() {
  const ctx = {
    modules: { broadcasts: [] },
    broadcastInlineErrors: {},
    broadcastInlineSaving: {},
    broadcastRowFinishing: {},
    broadcastRowDrafts: {},
    backfillBroadcastsFromRemote: jest.fn(() => Promise.resolve()),
    $message: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
    $set: (obj, key, val) => { obj[key] = val; return val },
    $delete: (obj, key) => { delete obj[key] },
    // real helpers under test
    broadcastInlineCellKey: methods.broadcastInlineCellKey,
    broadcastInlineCellError: methods.broadcastInlineCellError,
    clearBroadcastInlineCellError: methods.clearBroadcastInlineCellError,
    isBroadcastInlineSaving: methods.isBroadcastInlineSaving,
    isBroadcastRowFinishing: methods.isBroadcastRowFinishing,
    buildBroadcastInlinePayload: methods.buildBroadcastInlinePayload,
    // T62 off-row draft machinery
    broadcastRowDraftKey: methods.broadcastRowDraftKey,
    broadcastRowDraftEntry: methods.broadcastRowDraftEntry,
    isBroadcastRowDirty: methods.isBroadcastRowDirty,
    broadcastDraftValue: methods.broadcastDraftValue,
    broadcastDraftWeekdays: methods.broadcastDraftWeekdays,
    broadcastDraftDuration: methods.broadcastDraftDuration,
    recordBroadcastInlineDraft: methods.recordBroadcastInlineDraft,
    commitBroadcastRowFinish: methods.commitBroadcastRowFinish,
    cancelBroadcastRowDraft: methods.cancelBroadcastRowDraft,
    clearBroadcastRowDraft: methods.clearBroadcastRowDraft,
    toggleBroadcastRowWeekday: methods.toggleBroadcastRowWeekday,
    isBroadcastManualOnly: methods.isBroadcastManualOnly,
    // per-field recorders
    commitBroadcastInlineName: methods.commitBroadcastInlineName,
    commitBroadcastInlineVolume: methods.commitBroadcastInlineVolume,
    commitBroadcastInlineTime: methods.commitBroadcastInlineTime,
    commitBroadcastInlineWeekdays: methods.commitBroadcastInlineWeekdays,
    commitBroadcastInlineDuration: methods.commitBroadcastInlineDuration,
    resolveBroadcastDurationCandidate: methods.resolveBroadcastDurationCandidate,
    onDurationModeChange: methods.onDurationModeChange,
    normalizeWeekdays: methods.normalizeWeekdays,
    formatDurationHms: methods.formatDurationHms,
    toDurationSeconds: methods.toDurationSeconds,
    weekdaysOptions: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    commitBroadcastInlineAudio: methods.commitBroadcastInlineAudio,
    commitBroadcastInlineLocation: methods.commitBroadcastInlineLocation
  }
  return ctx
}

function makeRow(overrides = {}) {
  return {
    id: '500', taskid: '500', name: '早读铃', volume: 50,
    audio: '上课.mp3', time: '07:30:00', status: '停止', ...overrides
  }
}

// Read the off-row staged patch for a row+field (test helper).
function stagedPatch(ctx, row, field) {
  const entry = ctx.broadcastRowDrafts[String(row.taskid || row.id)]
  return entry && entry.patch ? entry.patch[field] : undefined
}

describe('T62 broadcast inline draft — cell edits STAGE off-row, do not PUT', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    commitBroadcastFields.mockResolvedValue({ status: 'ok', task_id: '500', dirty_fields: [] })
  })

  it('name edit records an off-row draft + overlay shows it, no PUT, row untouched', () => {
    const ctx = makeCtx()
    const row = makeRow()

    methods.commitBroadcastInlineName.call(ctx, row, '早读铃改')

    expect(commitBroadcastFields).not.toHaveBeenCalled()
    expect(methods.isBroadcastRowDirty.call(ctx, row)).toBe(true)
    expect(stagedPatch(ctx, row, 'name').value).toBe('早读铃改')
    expect(stagedPatch(ctx, row, 'name').spec.dirtyFields).toEqual(['taskname'])
    // overlay surfaces the staged value (cell :value reads this)
    expect(methods.broadcastDraftValue.call(ctx, row, 'name')).toBe('早读铃改')
    // the REAL row is NOT mutated (off-row design — no badge leak)
    expect(row.name).toBe('早读铃')
    expect(row._draftPatch).toBeUndefined()
    expect(row._draftDirty).toBeUndefined()
  })

  it('volume edit stages off-row, overlay shows rounded value, row untouched', () => {
    const ctx = makeCtx()
    const row = makeRow()
    methods.commitBroadcastInlineVolume.call(ctx, row, 80)
    expect(commitBroadcastFields).not.toHaveBeenCalled()
    expect(stagedPatch(ctx, row, 'volume').value).toBe(80)
    expect(methods.broadcastDraftValue.call(ctx, row, 'volume')).toBe(80)
    expect(row.volume).toBe(50)
  })

  it('no-op edit (unchanged value) does not stage a draft', () => {
    const ctx = makeCtx()
    const row = makeRow({ name: '早读铃', volume: 50 })
    methods.commitBroadcastInlineName.call(ctx, row, '早读铃')
    methods.commitBroadcastInlineVolume.call(ctx, row, 50)
    expect(methods.isBroadcastRowDirty.call(ctx, row)).toBe(false)
  })

  it('rejects empty name / out-of-range volume without staging', () => {
    const ctx = makeCtx()
    const row = makeRow()
    methods.commitBroadcastInlineName.call(ctx, row, '   ')
    methods.commitBroadcastInlineVolume.call(ctx, row, 200)
    expect(methods.isBroadcastRowDirty.call(ctx, row)).toBe(false)
    expect(ctx.$message.warning).toHaveBeenCalled()
  })

  it('time edit stages starttime with seconds preserved (no toTime truncation, KP#23)', () => {
    const ctx = makeCtx()
    const row = makeRow({ time: '07:30:00' })
    methods.commitBroadcastInlineTime.call(ctx, row, '08:15:30')
    expect(stagedPatch(ctx, row, 'time').value).toBe('08:15:30')
    expect(stagedPatch(ctx, row, 'time').spec.dirtyFields).toEqual(['starttime'])
    expect(methods.broadcastDraftValue.call(ctx, row, 'time')).toBe('08:15:30')
    expect(row.time).toBe('07:30:00')
  })

  it('weekdays el-select edit stages the normalized array', () => {
    const ctx = makeCtx()
    const row = makeRow({ weekdays: ['周一'] })
    methods.commitBroadcastInlineWeekdays.call(ctx, row, ['周三', '周一', '周五'])
    expect(stagedPatch(ctx, row, 'weekdays').value).toEqual(['周一', '周三', '周五'])
    expect(methods.broadcastDraftWeekdays.call(ctx, row)).toEqual(['周一', '周三', '周五'])
    expect(row.weekdays).toEqual(['周一'])
  })

  it('duration loop change stages timelength/timelengthtype, overlay shows mode/loop', () => {
    const ctx = makeCtx()
    const row = makeRow({ durationMode: 'loop', loop: 1 })
    methods.commitBroadcastInlineDuration.call(ctx, row, { loop: 3 })
    expect(stagedPatch(ctx, row, 'duration').spec.dirtyFields).toEqual(['timelength', 'timelengthtype'])
    expect(methods.broadcastDraftDuration.call(ctx, row, 'loop')).toBe(3)
    expect(methods.broadcastDraftDuration.call(ctx, row, 'mode')).toBe('loop')
    expect(row.loop).toBe(1)
  })

  it('audio edit stages medianame, strip:[mediaid], overlay shows new audio, row untouched', () => {
    const ctx = makeCtx()
    const row = makeRow({ audio: '上课.mp3', mediaid: '130' })
    methods.commitBroadcastInlineAudio.call(ctx, row, '下课.mp3')
    expect(stagedPatch(ctx, row, 'audio').spec.dirtyFields).toEqual(['medianame'])
    expect(stagedPatch(ctx, row, 'audio').spec.strip).toEqual(['mediaid'])
    expect(methods.broadcastDraftValue.call(ctx, row, 'audio')).toBe('下课.mp3')
    // row + its mediaid untouched while staged
    expect(row.audio).toBe('上课.mp3')
    expect(row.mediaid).toBe('130')
  })

  it('location edit stages location with the 5-id strip spec', () => {
    const ctx = makeCtx()
    const row = makeRow({ location: [['操场', '右一终端']], terminalids: ['14'] })
    methods.commitBroadcastInlineLocation.call(ctx, row, [['操场', '右二终端']])
    expect(stagedPatch(ctx, row, 'location').spec.dirtyFields).toEqual(['location'])
    expect(stagedPatch(ctx, row, 'location').spec.strip).toEqual(
      ['terminalids', 'liveterminalid', 'taskterminal', 'terminalnames', 'liveterminalname']
    )
    expect(methods.broadcastDraftValue.call(ctx, row, 'location')).toEqual([['操场', '右二终端']])
    expect(row.location).toEqual([['操场', '右一终端']])
  })
})

describe('T62 clickable weekday grid — toggle stages an off-row draft', () => {
  beforeEach(() => jest.clearAllMocks())

  it('clicking an unselected day adds it to the staged weekdays (normalized), no PUT', () => {
    const ctx = makeCtx()
    const row = makeRow({ weekdays: ['周三'] })
    methods.toggleBroadcastRowWeekday.call(ctx, row, '周一')
    expect(commitBroadcastFields).not.toHaveBeenCalled()
    expect(methods.broadcastDraftWeekdays.call(ctx, row)).toEqual(['周一', '周三'])
    expect(row.weekdays).toEqual(['周三'])
    expect(methods.isBroadcastRowDirty.call(ctx, row)).toBe(true)
  })

  it('clicking a selected day removes it (from the staged overlay)', () => {
    const ctx = makeCtx()
    const row = makeRow({ weekdays: ['周一', '周三'] })
    methods.toggleBroadcastRowWeekday.call(ctx, row, '周一')
    expect(methods.broadcastDraftWeekdays.call(ctx, row)).toEqual(['周三'])
  })

  it('two clicks compound on the staged overlay, not the row', () => {
    const ctx = makeCtx()
    const row = makeRow({ weekdays: [] })
    methods.toggleBroadcastRowWeekday.call(ctx, row, '周一')
    methods.toggleBroadcastRowWeekday.call(ctx, row, '周二')
    expect(methods.broadcastDraftWeekdays.call(ctx, row)).toEqual(['周一', '周二'])
    expect(row.weekdays).toEqual([])
  })

  it('manual-only row (00:00 time) ignores weekday clicks', () => {
    const ctx = makeCtx()
    const row = makeRow({ time: '00:00:00', weekdays: [] })
    methods.toggleBroadcastRowWeekday.call(ctx, row, '周一')
    expect(methods.isBroadcastRowDirty.call(ctx, row)).toBe(false)
  })
})

describe('T62 完成 — packs all staged fields into ONE commitBroadcastFields PUT', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    commitBroadcastFields.mockResolvedValue({ status: 'ok', task_id: '500', dirty_fields: [] })
  })

  it('multi-field draft → one PUT with merged dirty_fields, then canonical refill + clear', async() => {
    const ctx = makeCtx()
    const row = makeRow({ name: '早读铃', volume: 50, time: '07:30:00' })
    methods.commitBroadcastInlineName.call(ctx, row, '早读铃改')
    methods.commitBroadcastInlineVolume.call(ctx, row, 80)
    methods.commitBroadcastInlineTime.call(ctx, row, '08:00:00')

    await methods.commitBroadcastRowFinish.call(ctx, row)

    // ONE PUT, not three — the batch design.
    expect(commitBroadcastFields).toHaveBeenCalledTimes(1)
    const [taskId, payload] = commitBroadcastFields.mock.calls[0]
    expect(taskId).toBe('500')
    // merged dirty_fields covers every staged field's dirtyFields
    expect(payload.dirty_fields.sort()).toEqual(['starttime', 'taskname', 'volume'])
    expect(payload.row.taskname).toBe('早读铃改')
    expect(payload.row.volume).toBe(80)
    expect(payload.row.starttime).toBe('08:00:00')
    // off-row draft dropped + canonical refill ran (KP#23) + toast
    expect(ctx.broadcastRowDrafts['500']).toBeUndefined()
    expect(methods.isBroadcastRowDirty.call(ctx, row)).toBe(false)
    expect(ctx.backfillBroadcastsFromRemote).toHaveBeenCalledTimes(1)
    expect(ctx.$message.success).toHaveBeenCalledWith('任务已更新')
  })

  it('audio + location draft merges both strips into one PUT', async() => {
    const ctx = makeCtx()
    const row = makeRow({ audio: '上课.mp3', mediaid: '130', location: [['操场', '右一终端']] })
    methods.commitBroadcastInlineAudio.call(ctx, row, '下课.mp3')
    methods.commitBroadcastInlineLocation.call(ctx, row, [['操场', '右二终端']])

    await methods.commitBroadcastRowFinish.call(ctx, row)

    const [, payload] = commitBroadcastFields.mock.calls[0]
    expect(payload.dirty_fields.sort()).toEqual(['location', 'medianame'])
    expect(payload.row.medianame).toBe('下课.mp3')
    expect(payload.row.location).toEqual([['操场', '右二终端']])
    // both strip sets applied: mediaid + all 5 terminal id columns gone
    expect(payload.row.mediaid).toBeUndefined()
    expect(payload.row.terminalids).toBeUndefined()
    expect(payload.row.liveterminalid).toBeUndefined()
    expect(payload.row.liveterminalname).toBeUndefined()
  })

  it('finish with no staged fields just clears (no PUT)', async() => {
    const ctx = makeCtx()
    const row = makeRow()
    await methods.commitBroadcastRowFinish.call(ctx, row)
    expect(commitBroadcastFields).not.toHaveBeenCalled()
    expect(methods.isBroadcastRowDirty.call(ctx, row)).toBe(false)
  })

  // reverse-truth: a failed finish must surface a row error, NOT refill, and
  // keep the draft staged so the user can retry.
  it('failed finish sets the row error, does NOT refill, keeps the draft staged', async() => {
    commitBroadcastFields.mockRejectedValue({ response: { status: 500, data: { detail: '远端 500' }}})
    const ctx = makeCtx()
    const row = makeRow({ name: '早读铃' })
    methods.commitBroadcastInlineName.call(ctx, row, '早读铃改')

    await methods.commitBroadcastRowFinish.call(ctx, row)

    expect(ctx.broadcastInlineErrors['500__row']).toBe('远端 500')
    expect(ctx.backfillBroadcastsFromRemote).not.toHaveBeenCalled()
    // draft survives so the user can fix + retry
    expect(methods.isBroadcastRowDirty.call(ctx, row)).toBe(true)
    expect(stagedPatch(ctx, row, 'name').value).toBe('早读铃改')
  })

  // 422 fail-loud (location): warning, not hard error, draft kept.
  it('422 fail-loud on finish surfaces a warning and keeps the staged location', async() => {
    commitBroadcastFields.mockRejectedValue({ response: { status: 422, data: { detail: 'location 解析不到任何终端，请重选' }}})
    const ctx = makeCtx()
    const row = makeRow({ location: [['操场', '右一终端']] })
    methods.commitBroadcastInlineLocation.call(ctx, row, [['无分区终端', '游离终端']])

    await methods.commitBroadcastRowFinish.call(ctx, row)

    expect(ctx.$message.warning).toHaveBeenCalledWith('location 解析不到任何终端，请重选')
    expect(ctx.$message.error).not.toHaveBeenCalled()
    expect(methods.isBroadcastRowDirty.call(ctx, row)).toBe(true)
  })
})

describe('T62 取消 — drops the off-row draft (row was never mutated)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('clears the staged draft so the overlay reverts to the row value', () => {
    const ctx = makeCtx()
    const row = makeRow({ name: '早读铃', volume: 50, time: '07:30:00' })
    methods.commitBroadcastInlineName.call(ctx, row, '改名')
    methods.commitBroadcastInlineVolume.call(ctx, row, 90)
    methods.commitBroadcastInlineTime.call(ctx, row, '09:00:00')
    // overlay shows staged
    expect(methods.broadcastDraftValue.call(ctx, row, 'name')).toBe('改名')

    methods.cancelBroadcastRowDraft.call(ctx, row)

    // off-row draft dropped → overlay falls back to the (untouched) row
    expect(methods.broadcastDraftValue.call(ctx, row, 'name')).toBe('早读铃')
    expect(methods.broadcastDraftValue.call(ctx, row, 'volume')).toBe(50)
    expect(methods.broadcastDraftValue.call(ctx, row, 'time')).toBe('07:30:00')
    expect(methods.isBroadcastRowDirty.call(ctx, row)).toBe(false)
    // the row never changed in the first place
    expect(row.name).toBe('早读铃')
  })

  it('audio cancel reverts the overlay including the would-be-stripped mediaid', () => {
    const ctx = makeCtx()
    const row = makeRow({ audio: '上课.mp3', mediaid: '130' })
    methods.commitBroadcastInlineAudio.call(ctx, row, '下课.mp3')

    methods.cancelBroadcastRowDraft.call(ctx, row)

    expect(methods.broadcastDraftValue.call(ctx, row, 'audio')).toBe('上课.mp3')
    // mediaid was never dropped from the row (strip only happens in the PUT payload)
    expect(row.mediaid).toBe('130')
  })
})

describe('T62 payload builder still strips local-only draft flags', () => {
  it('buildBroadcastInlinePayload removes _draftDirty / _draftPatch / _originalSnapshot', () => {
    const ctx = makeCtx()
    const row = makeRow({ _draftDirty: true, _draftPatch: { x: 1 }, _originalSnapshot: {}})
    const payload = methods.buildBroadcastInlinePayload.call(ctx, row, {
      dirtyFields: ['taskname'], apply: (p) => { p.taskname = '改' }
    })
    expect(payload._draftDirty).toBeUndefined()
    expect(payload._draftPatch).toBeUndefined()
    expect(payload._originalSnapshot).toBeUndefined()
    expect(payload.taskname).toBe('改')
  })

  it('broadcastAudioOptions scopes to the file-broadcast library (folderid===2 only)', () => {
    const audioOptions = [
      { value: '上课.mp3', label: '上课.mp3', id: '130', folderid: 2 },
      { value: '上课.mp3', label: '上课.mp3(即时)', id: '999', folderid: 3 },
      { value: '下课.mp3', label: '下课.mp3', id: '133', folderid: 2 }
    ]
    const scoped = TaskSchedulerPage.computed.broadcastAudioOptions.call({ audioOptions })
    expect(scoped.map((x) => x.id)).toEqual(['130', '133'])
  })
})
