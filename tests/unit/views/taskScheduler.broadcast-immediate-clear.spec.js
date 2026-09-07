/**
 * T41 Option A — broadcast immediate handlers defensive draft clear.
 *
 * Symptom (PO G4 2026-06-06): user changes date / adds a task in the
 * broadcast tab → backend already accepted (PUT /task/taskinfo /
 * POST /task/jsontask... — verified 200 on :183), but the UI keeps
 * showing the "未上传草稿" badge. Phantom dirty residue.
 *
 * Suspect #2 (snapshot patch empty-array guard at
 * patchBroadcastSyncedSnapshotForRow:2613-2636 + the
 * currentBroadcastBaseSnapshot:2219-2230 fallback) plausibly leaves
 * draftState.broadcastBaseSnapshot=[] while dirtyScopes still contains
 * 'broadcasts', so the deep-watcher diff computes "current N rows vs
 * baseline 0" → every row phantom-dirty. Not investigated this lane
 * (root cause kept for a future trace).
 *
 * Defensive Option A (this commit): after each broadcast immediate
 * handler's success path, call clearBroadcastDraftState() to nuke the
 * broadcast-scope draft. Safe invariant: broadcast tab has NO inline
 * cell editor (all cells readonly post T37 drawer redesign) — every
 * change flows through drawer/toolbar and lands on the remote before
 * the clear runs, so "no uncommitted content" is guaranteed.
 *
 * Reverse-truth: removing any one of the 3 clearBroadcastDraftState()
 * calls makes the corresponding case below FAIL (broadcastDirtyIds
 * stays non-empty or dirtyScopes still contains 'broadcasts').
 *
 * Layout mirrors taskScheduler.add-snapshot-mirror.spec.js so the
 * mocking pattern + ctx scaffolding stay consistent.
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

jest.mock('@/utils/schedulerStorage', () => {
  const actual = jest.requireActual('@/utils/schedulerStorage')
  return {
    ...actual,
    loadSchedulerDrafts: jest.fn(() => actual.getDefaultSchedulerDrafts())
  }
})

import {
  addBroadcastImmediate,
  commitBroadcastFields
} from '@/api/dataService'
import { hasSchedulerDirtyScope } from '@/utils/schedulerStorage'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

// Build a ctx that wires the real broadcast immediate handlers + the
// real clearBroadcastDraftState method (which delegates to the real
// clearBroadcastDraft helper from schedulerStorage). The point of the
// spec is the post-success state of ctx.draftState.broadcastDirtyIds +
// the dirtyScopes — so we leave the schedulerStorage write-side real
// and just assert against the returned draftState.
function makeCtx({ seedDirtyIds = ['500'], seedDeletedIds = [] } = {}) {
  const seedBroadcasts = seedDirtyIds.map((id) => ({
    id: String(id), taskid: String(id), name: `残留-${id}`, volume: 50
  }))
  const ctx = {
    addingBroadcast: false,
    audioOptions: [{ value: '默认.mp3', label: '默认.mp3' }],
    modules: { broadcasts: [] },
    lastSyncedBroadcasts: [],
    lastSyncedBroadcastBaseSnapshot: [],
    // Seed a phantom-dirty pre-state so the clear has something to
    // clear. This mirrors the PO G4 reproduction: by the time the
    // handler runs, the deep-watcher (or a stale prior session) has
    // already populated draftState.broadcastDirtyIds + dirtyScopes,
    // and the success path needs to flush them.
    //
    // The seedDirtyIds parameter lets cases 1-3 seed the own id
    // (handler clears) and cases 5-7 seed other-row batch staging
    // (guard refuses to clear).
    draftState: {
      plans: [],
      planDirtyIds: [],
      planDeletedIds: [],
      planBaseSnapshot: [],
      broadcasts: seedBroadcasts,
      broadcastDirtyIds: seedDirtyIds.map(String),
      broadcastDeletedIds: seedDeletedIds.map(String),
      broadcastBaseSnapshot: [],
      dirtyScopes: ['broadcasts']
    },
    broadcastDraftSyncSuspendedCount: 0,
    $message: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
    $nextTick: (cb) => { if (typeof cb === 'function') cb(); return Promise.resolve() },

    cloneRows: methods.cloneRows,
    prepareBroadcastRows: methods.prepareBroadcastRows,
    buildBroadcastBaseSnapshot: methods.buildBroadcastBaseSnapshot,
    areBroadcastRowsEqual: methods.areBroadcastRowsEqual,
    currentBroadcastBaseSnapshot: methods.currentBroadcastBaseSnapshot,
    withBroadcastDraftSyncSuspended: methods.withBroadcastDraftSyncSuspended,
    withBroadcastDraftSyncSuspendedAsync: methods.withBroadcastDraftSyncSuspendedAsync,
    applyBroadcastImmediateThenClear: methods.applyBroadcastImmediateThenClear,
    startBroadcastDraftSyncSuspension: methods.startBroadcastDraftSyncSuspension,
    stopBroadcastDraftSyncSuspension: methods.stopBroadcastDraftSyncSuspension,
    patchBroadcastSyncedSnapshotForRow: methods.patchBroadcastSyncedSnapshotForRow,
    newBroadcastRow: methods.newBroadcastRow,
    buildUniqueBroadcastName: methods.buildUniqueBroadcastName,
    buildAllTaskRow: methods.buildAllTaskRow,
    addBroadcastRow: methods.addBroadcastRow,
    saveBroadcastTaskDrawer: methods.saveBroadcastTaskDrawer,
    clearBroadcastDraftState: methods.clearBroadcastDraftState,
    _canClearBroadcastDraftAfterImmediateCommit: methods._canClearBroadcastDraftAfterImmediateCommit,
    // T51 ①: the add paths now backfill canonical rows from the remote after the
    // clear. This spec isolates the clear/guard logic, so stub the backfill to a
    // no-op (the canonical refill is covered by the T51 spec).
    backfillBroadcastsFromRemote: jest.fn(() => Promise.resolve()),
    $set: (target, key, value) => {
      target[key] = value
      return value
    },

    createBroadcastDraftId: () => `draft-${Math.random().toString(36).slice(2, 8)}`,
    defaultLocation: () => [],
    normalizeBroadcastTempId: (value, fallbackTaskId, idx) => {
      const candidates = [value, fallbackTaskId]
      for (const candidate of candidates) {
        if (candidate === undefined || candidate === null) continue
        const text = String(candidate).trim()
        if (/^\d+$/.test(text) && text !== '0') return text
        if (text) return text
      }
      return `draft-broadcast-${idx}`
    },
    uniqueStringList: (value) => Array.from(
      new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter((item) => item))
    ),
    normalizeLocationPaths: (value) => (Array.isArray(value) ? value : []),
    formatDurationHms: (value) => String(value || '00:05:00'),
    resolveLocationFromRow: (row) => (Array.isArray(row?.location) ? row.location : []),
    normalizeWeekdays: methods.normalizeWeekdays,
    toTime: (value) => {
      const text = String(value || '').trim()
      if (!text) return '00:00:00'
      return text.length === 5 ? `${text}:00` : text
    },
    normalizeRealTaskId: (value) => {
      const text = String(value ?? '').trim()
      return /^\d+$/.test(text) && text !== '0' ? text : ''
    },
    formatTaskinfoDurationForApi: () => '1',
    resolvePlanTaskTerminalFields: (row) => ({
      location: Array.isArray(row?.location) ? row.location : [],
      terminalids: Array.isArray(row?.terminalids) ? row.terminalids : [],
      terminalnames: Array.isArray(row?.terminalnames) ? row.terminalnames : [],
      liveterminalid: row?.liveterminalid || '',
      liveterminalname: row?.liveterminalname || ''
    }),
    toDurationSeconds: (value) => {
      if (typeof value === 'number') return value
      const text = String(value || '').trim()
      if (!text) return 0
      if (/^\d+$/.test(text)) return Number(text)
      const parts = text.split(':').map((seg) => Number(seg) || 0)
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
      if (parts.length === 2) return parts[0] * 60 + parts[1]
      return 0
    },
    draftToBroadcastRow: methods.draftToBroadcastRow,
    normalizeDate: (value) => {
      const text = String(value || '').trim()
      if (!text) return ''
      const match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
      if (!match) return ''
      return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
    },
    closeTaskDrawer: jest.fn(),
    taskDrawer: {
      visible: false, plan: null, task: null, draft: null,
      isNew: false, isOnceOverride: false, overrideId: '', onceTaskId: '',
      sourceSummary: '', kind: 'broadcast', broadcastRow: null
    },

    // Keep syncBroadcastDraftState a no-op spy so the clear we are
    // testing is the load-bearing step (not masked by the sync's own
    // recompute).
    syncBroadcastDraftState: jest.fn(),
    persistBroadcastDraftLocally: jest.fn()
  }
  return ctx
}

describe('TaskSchedulerPage broadcast immediate handlers clear draft (T41 Option A, KP #22)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    addBroadcastImmediate.mockResolvedValue({ task_id: '73900' })
    commitBroadcastFields.mockResolvedValue({ status: 'ok', task_id: '500' })
  })

  // ── happy path: residue is own-id ⇒ guard allows clear ─────────────
  //
  // Cases 1-3 seed the dirty residue with the SAME id the handler is
  // about to commit (phantom dirty for that row only). The guard
  // _canClearBroadcastDraftAfterImmediateCommit allows the clear so
  // the badge stops lying after a successful immediate write.

  // Case 1: drawer add (isNew=true) — saveBroadcastTaskDrawer success
  // path clears the broadcast draft scope when the residue is only
  // the row's own taskid.
  it('case 1: drawer add isNew=true with own-id residue → clears broadcastDirtyIds + dirtyScopes', async() => {
    // addBroadcastImmediate returns task_id '73900' (see beforeEach).
    const ctx = makeCtx({ seedDirtyIds: ['73900'] })
    const draft = {
      customName: '新铃声',
      audio: '默认.mp3',
      mediaid: '101',
      time: '08:00:00',
      durationMode: 'loop',
      loop: 1,
      weekdays: ['周一'],
      location: [['zone-1', 'T1']],
      volume: 60
    }

    await ctx.saveBroadcastTaskDrawer({ draft, isNew: true })

    expect(addBroadcastImmediate).toHaveBeenCalledTimes(1)
    expect(commitBroadcastFields).not.toHaveBeenCalled()
    // Guard allowed clear because residue was just '73900' (own id).
    expect(ctx.draftState.broadcastDirtyIds).toEqual([])
    expect(ctx.draftState.broadcastDeletedIds).toEqual([])
    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(false)
  })

  // Case 2: drawer edit (isNew=false) — commitBroadcastFields success
  // path clears when residue is the edited row's own taskid.
  it('case 2: drawer edit isNew=false with own-id residue → clears broadcastDirtyIds + dirtyScopes', async() => {
    const ctx = makeCtx({ seedDirtyIds: ['500'] })
    const row = {
      id: '500', taskid: '500', name: '早读铃', volume: 50,
      audio: '上课.mp3', mediaid: '303', time: '07:30:00',
      durationMode: 'loop', loop: 1,
      weekdays: ['周一'], location: [['zone-1', 'T1']],
      terminalids: ['9'], terminalnames: ['T1']
    }
    ctx.modules.broadcasts.push(row)
    ctx.taskDrawer.broadcastRow = row
    const draft = {
      customName: '早读铃改',
      audio: '默认.mp3',
      mediaid: '101',
      time: '07:30:00',
      durationMode: 'loop',
      loop: 1,
      weekdays: ['周一'],
      location: [['zone-1', 'T1']],
      volume: 88,
      taskid: '500',
      id: '500'
    }

    await ctx.saveBroadcastTaskDrawer({ draft, isNew: false })

    expect(commitBroadcastFields).toHaveBeenCalledTimes(1)
    expect(addBroadcastImmediate).not.toHaveBeenCalled()
    expect(ctx.draftState.broadcastDirtyIds).toEqual([])
    expect(ctx.draftState.broadcastDeletedIds).toEqual([])
    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(false)
  })

  // Case 3: toolbar add (addBroadcastRow) — clears when residue is
  // the new row's own taskid.
  it('case 3: toolbar add with own-id residue → clears broadcastDirtyIds + dirtyScopes', async() => {
    const ctx = makeCtx({ seedDirtyIds: ['73900'] })

    await ctx.addBroadcastRow()

    expect(addBroadcastImmediate).toHaveBeenCalledTimes(1)
    expect(ctx.draftState.broadcastDirtyIds).toEqual([])
    expect(ctx.draftState.broadcastDeletedIds).toEqual([])
    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(false)
  })

  // Negative control — the draftState shape this spec uses is realistic
  // (i.e. without the clear, broadcastDirtyIds would stay populated).
  // This pins the seed so a future refactor of makeCtx that drops the
  // seed silently does NOT make the 3 cases pass vacuously.
  it('case 4 (seed contract): makeCtx draftState starts with broadcasts dirty (non-vacuous baseline)', () => {
    const ctx = makeCtx({ seedDirtyIds: ['500'] })
    expect(ctx.draftState.broadcastDirtyIds).toEqual(['500'])
    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(true)
  })

  // ── reverse-truth: residue is OTHER-row batch staging ⇒ guard refuses ──
  //
  // Cases 5-7 seed the dirty residue with ids OTHER than the row
  // being committed. The guard _canClearBroadcastDraftAfterImmediateCommit
  // must refuse to clear so the user's applyVolume('broadcast') /
  // setBroadcastStatus 暂停-类 batch staging survives.
  //
  // Reverse-truth: removing the guard → these cases FAIL because the
  // immediate handler nukes the batch staging silently.

  // Case 5: drawer add (isNew=true) with 3 batch-volume rows already
  // staged. New row newTaskId='73900' is unrelated to '100' / '200' /
  // '300'. The guard refuses the clear, batch staging survives.
  it('case 5: drawer add does NOT swallow batch-volume staging (3 other rows dirty)', async() => {
    const ctx = makeCtx({ seedDirtyIds: ['100', '200', '300'] })
    const draft = {
      customName: '新铃声',
      audio: '默认.mp3',
      mediaid: '101',
      time: '08:00:00',
      durationMode: 'loop',
      loop: 1,
      weekdays: ['周一'],
      location: [['zone-1', 'T1']],
      volume: 60
    }

    await ctx.saveBroadcastTaskDrawer({ draft, isNew: true })

    expect(addBroadcastImmediate).toHaveBeenCalledTimes(1)
    // Batch staging preserved: dirtyIds unchanged.
    expect(ctx.draftState.broadcastDirtyIds).toEqual(['100', '200', '300'])
    // 'broadcasts' still in dirtyScopes (the badge keeps showing).
    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(true)
  })

  // Case 6: drawer edit (isNew=false) — edited row's own taskid is
  // '500'; residue also has '100' and '200' from a prior batch volume
  // op. Guard refuses because dirtyIds.every(=== '500') is false.
  // Batch staging fully preserved (including the '500' since we don't
  // do a half-clear — the whole scope is preserved when guard refuses).
  it('case 6: drawer edit does NOT swallow batch staging when other rows dirty', async() => {
    const ctx = makeCtx({ seedDirtyIds: ['500', '100', '200'] })
    const row = {
      id: '500', taskid: '500', name: '早读铃', volume: 50,
      audio: '上课.mp3', mediaid: '303', time: '07:30:00',
      durationMode: 'loop', loop: 1,
      weekdays: ['周一'], location: [['zone-1', 'T1']],
      terminalids: ['9'], terminalnames: ['T1']
    }
    ctx.modules.broadcasts.push(row)
    ctx.taskDrawer.broadcastRow = row
    const draft = {
      customName: '早读铃改',
      audio: '默认.mp3',
      mediaid: '101',
      time: '07:30:00',
      durationMode: 'loop',
      loop: 1,
      weekdays: ['周一'],
      location: [['zone-1', 'T1']],
      volume: 88,
      taskid: '500',
      id: '500'
    }

    await ctx.saveBroadcastTaskDrawer({ draft, isNew: false })

    expect(commitBroadcastFields).toHaveBeenCalledTimes(1)
    // Guard refused: ALL dirty ids preserved (including '500' — the
    // helper is conservative, it does not half-clear). The user will
    // still see broadcasts dirty until they hit 保存上传 or the next
    // sync, but no batch staging is silently lost.
    expect(ctx.draftState.broadcastDirtyIds).toEqual(['500', '100', '200'])
    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(true)
  })

  // Case 7: toolbar add — newTaskId='73900' but residue is a single
  // other-row batch staging '100'. Guard refuses.
  it('case 7: toolbar add does NOT swallow batch staging (single other row dirty)', async() => {
    const ctx = makeCtx({ seedDirtyIds: ['100'] })

    await ctx.addBroadcastRow()

    expect(addBroadcastImmediate).toHaveBeenCalledTimes(1)
    expect(ctx.draftState.broadcastDirtyIds).toEqual(['100'])
    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(true)
  })

  // Case 8: extra defensive — pending delete also refuses clear, even
  // if dirtyIds is empty / matches own id. Pending delete is batch
  // by nature (the user selected rows to delete in bulk).
  it('case 8: pending broadcastDeletedIds refuses clear (own-id dirty alone)', async() => {
    const ctx = makeCtx({ seedDirtyIds: ['73900'], seedDeletedIds: ['400'] })

    await ctx.addBroadcastRow()

    expect(addBroadcastImmediate).toHaveBeenCalledTimes(1)
    // Guard refused because deletedIds.length > 0.
    expect(ctx.draftState.broadcastDeletedIds).toEqual(['400'])
    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(true)
  })
})

// ── F4 timing ordering (KP #22 suspect A 治本) ───────────────────────────
//
// The PO G4 phantom-dirty was a tick-ordering bug: the modules.broadcasts deep
// watcher fires its recompute on a LATER tick, and pre-F4 the clear ran
// synchronously BEFORE the suspension's $nextTick settled, so the watcher could
// re-dirty after the clear. F4 routes all three immediate handlers through
// applyBroadcastImmediateThenClear, which awaits withBroadcastDraftSyncSuspendedAsync
// (so the watcher fires while still suspended → its handler early-returns) and
// only THEN runs the guarded clear — making clear the genuine last step.
//
// jsdom cannot attach the real deep watcher, and the synced base snapshot is
// patched correctly so a plain "trailing recompute" stays clean regardless of
// order (see F3 diagnostic — suspect B does not fire on the sync path). So the
// load-bearing property the fix actually guarantees is an ORDERING one, and
// that IS deterministically testable: the clear must run AFTER the suspension
// has been lifted (stopBroadcastDraftSyncSuspension), i.e. after the await.
// Reverse-truth: the old synchronous order ran clear before the lift, which
// these ordering assertions catch.
function makeOrderingCtx({ seedDirtyIds = [] } = {}) {
  const ctx = makeCtx({ seedDirtyIds })
  // CRITICAL: use a REAL async $nextTick (microtask deferral) — the default
  // makeCtx $nextTick runs the callback synchronously, which collapses the
  // very tick-ordering this test is about. With an async $nextTick the
  // suspension lift (scheduled inside withBroadcastDraftSyncSuspended* via
  // $nextTick) is deferred to a microtask, so the pre-F4 synchronous clear
  // would run BEFORE the lift, while F4's await-then-clear runs AFTER it.
  ctx.$nextTick = (cb) => Promise.resolve().then(() => { if (typeof cb === 'function') cb() })
  const order = []
  const realStop = methods.stopBroadcastDraftSyncSuspension
  ctx.stopBroadcastDraftSyncSuspension = function() {
    order.push('lift')
    return realStop.call(this)
  }
  const realClear = methods.clearBroadcastDraftState
  ctx.clearBroadcastDraftState = function() {
    order.push('clear')
    return realClear.call(this)
  }
  ctx.__order = order
  return ctx
}

describe('TaskSchedulerPage broadcast immediate clear — F4 clear-after-watcher-tick ordering', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    addBroadcastImmediate.mockResolvedValue({ task_id: '73900' })
    commitBroadcastFields.mockResolvedValue({ status: 'ok', task_id: '500' })
  })

  it('case 9: drawer add clears AFTER the suspension lifts (clear is the last step)', async() => {
    const ctx = makeOrderingCtx({ seedDirtyIds: ['73900'] })
    const draft = {
      customName: '新铃声', audio: '默认.mp3', mediaid: '101', time: '08:00:00',
      durationMode: 'loop', loop: 1, weekdays: ['周一'], location: [['zone-1', 'T1']], volume: 60
    }

    await ctx.saveBroadcastTaskDrawer({ draft, isNew: true })

    expect(ctx.__order).toEqual(['lift', 'clear'])
    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(false)
  })

  it('case 10: toolbar add clears AFTER the suspension lifts', async() => {
    const ctx = makeOrderingCtx({ seedDirtyIds: ['73900'] })

    await ctx.addBroadcastRow()

    expect(ctx.__order).toEqual(['lift', 'clear'])
    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(false)
  })

  it('case 11: drawer edit clears AFTER the suspension lifts', async() => {
    const ctx = makeOrderingCtx({ seedDirtyIds: ['500'] })
    const row = {
      id: '500', taskid: '500', name: '早读铃', volume: 50,
      audio: '上课.mp3', mediaid: '303', time: '07:30:00',
      durationMode: 'loop', loop: 1,
      weekdays: ['周一'], location: [['zone-1', 'T1']],
      terminalids: ['9'], terminalnames: ['T1']
    }
    ctx.modules.broadcasts.push(row)
    ctx.taskDrawer.broadcastRow = row
    const draft = {
      customName: '早读铃改', audio: '默认.mp3', mediaid: '101', time: '07:30:00',
      durationMode: 'loop', loop: 1, weekdays: ['周一'], location: [['zone-1', 'T1']],
      volume: 88, taskid: '500', id: '500'
    }

    await ctx.saveBroadcastTaskDrawer({ draft, isNew: false })

    expect(ctx.__order).toEqual(['lift', 'clear'])
    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(false)
  })
})
