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
  loadSchedulerDrafts: jest.fn(() => ({ plans: [], planDirtyIds: [], planDeletedIds: [], planBaseSnapshot: [], dirtyScopes: [] }))
}))

import { fetchAllAudio, fetchAllTerminalData, fetchAllLoc } from '@/api/dataService'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

const flushMicrotasks = async(count = 5) => {
  for (let i = 0; i < count; i += 1) await Promise.resolve()
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('TaskSchedulerPage bootstrap parallelization (T12 P2)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('runs loadAssets and loadModules in parallel (both started before either finishes)', async() => {
    const order = []
    const assetsDef = deferred()
    const modulesDef = deferred()
    const ctx = {
      loading: false,
      setTableLoading: jest.fn(),
      loadAssets: jest.fn(() => { order.push('assets:start'); return assetsDef.promise }),
      loadModules: jest.fn(() => { order.push('modules:start'); return modulesDef.promise })
    }

    const pending = methods.bootstrap.call(ctx)
    await Promise.resolve()

    // both kicked off before either resolves → true parallelism
    expect(ctx.loadAssets).toHaveBeenCalledTimes(1)
    expect(ctx.loadModules).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['assets:start', 'modules:start'])
    expect(ctx.loading).toBe(true)

    assetsDef.resolve()
    modulesDef.resolve()
    await pending
    expect(ctx.loading).toBe(false)
  })

  it('keeps loading flag cleared even if one of the two rejects (mixed success/failure)', async() => {
    // bootstrap uses Promise.all; loadAssets/loadModules own their try/catch so
    // they normally resolve. This guards the bootstrap wrapper itself: if one
    // rejects, the finally still clears loading and the error propagates rather
    // than being swallowed silently.
    const ctx = {
      loading: false,
      setTableLoading: jest.fn(),
      loadAssets: jest.fn(() => Promise.resolve()),
      loadModules: jest.fn(() => Promise.reject(new Error('modules boom')))
    }

    await expect(methods.bootstrap.call(ctx)).rejects.toThrow('modules boom')
    expect(ctx.loading).toBe(false) // finally ran
  })

  it('loadAssets fires audio + terminal fetches in parallel before awaiting', async() => {
    const order = []
    fetchAllAudio.mockImplementation(() => { order.push('audio'); return Promise.resolve([]) })
    fetchAllTerminalData.mockImplementation(() => { order.push('terminal'); return Promise.resolve({ zones: [] }) })
    fetchAllLoc.mockResolvedValue([])

    const ctx = {
      mapAudioOptions: jest.fn(() => []),
      mapLocationOptions: jest.fn(() => []),
      $message: { error: jest.fn() }
    }

    await methods.loadAssets.call(ctx)

    // both fetches were initiated (audio kicked off first, terminal right after,
    // before any await resolved)
    expect(order).toEqual(['audio', 'terminal'])
    expect(fetchAllAudio).toHaveBeenCalledTimes(1)
    expect(fetchAllTerminalData).toHaveBeenCalledTimes(1)
  })

  it('loadAssets: audio failure does not block terminal data processing (mixed)', async() => {
    fetchAllAudio.mockRejectedValueOnce(new Error('audio down'))
    fetchAllTerminalData.mockResolvedValueOnce({
      zones: [],
      zone_terminals: {},
      terminal_info: []
    })
    fetchAllLoc.mockResolvedValueOnce([{ value: 'loc-1', children: [] }])

    const errorMsgs = []
    const ctx = {
      mapAudioOptions: jest.fn(() => ['should-not-be-set']),
      mapLocationOptions: jest.fn((p) => p),
      zoneValueLabel: (id) => String(id),
      zoneNameFromItem: () => '',
      buildTerminalMaps: jest.fn(() => ({ zoneValueMap: {}, terminalIdMap: {}, terminalNameZoneMap: {} })),
      buildLocationOptionsFromZones: jest.fn(() => []),
      $message: { error: (m) => errorMsgs.push(m) }
    }

    await methods.loadAssets.call(ctx)

    // audio failed → its error surfaced, audioOptions untouched
    expect(errorMsgs).toContain('加载音频资源失败')
    expect(ctx.audioOptions).toBeUndefined()
    // terminal path still ran → fell back to fetchAllLoc since no zones
    expect(fetchAllLoc).toHaveBeenCalledTimes(1)
    expect(ctx.locationOptions).toEqual([{ value: 'loc-1', children: [] }])
  })

  it('loadAssets: terminal failure surfaces error and falls back to fetchAllLoc, audio still set', async() => {
    fetchAllAudio.mockResolvedValueOnce([{ value: 'a1' }])
    fetchAllTerminalData.mockRejectedValueOnce(new Error('terminal down'))
    fetchAllLoc.mockResolvedValueOnce([{ value: 'loc-fallback', children: [] }])

    const errorMsgs = []
    const ctx = {
      mapAudioOptions: jest.fn((p) => p),
      mapLocationOptions: jest.fn((p) => p),
      $message: { error: (m) => errorMsgs.push(m) }
    }

    await methods.loadAssets.call(ctx)

    // audio resolved independently of the terminal rejection
    expect(ctx.audioOptions).toEqual([{ value: 'a1' }])
    // terminal rejection handled (caught), location came from the loc fallback
    expect(fetchAllLoc).toHaveBeenCalledTimes(1)
    expect(ctx.locationOptions).toEqual([{ value: 'loc-fallback', children: [] }])
    expect(ctx.hasReliableLocationOptions).toBe(false)
  })

  it('loadAssets returns the same result shape as before with both succeeding', async() => {
    fetchAllAudio.mockResolvedValueOnce([{ value: 'a1' }, { value: 'a2' }])
    fetchAllTerminalData.mockResolvedValueOnce({ zones: [], zone_terminals: {}, terminal_info: [] })
    fetchAllLoc.mockResolvedValueOnce([])

    const ctx = {
      mapAudioOptions: (p) => p,
      mapLocationOptions: (p) => p,
      $message: { error: jest.fn() }
    }

    await methods.loadAssets.call(ctx)

    expect(ctx.audioOptions).toEqual([{ value: 'a1' }, { value: 'a2' }])
    expect(ctx.locationOptions).toEqual([])
    expect(ctx.terminalIdMap).toEqual({})
    expect(ctx.terminalNameZoneMap).toEqual({})
  })
})
