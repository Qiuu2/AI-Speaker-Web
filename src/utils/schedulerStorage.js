const STORAGE_KEY = 'AI_SCHEDULER_DATA'

const defaultData = {
  plans: [
    {
      id: 1,
      name: '夏季方案',
      status: '启用',
      tasks: [
        {
          id: 'p1-t1',
          audio: '校园铃声.mp3',
          time: '08:00',
          duration: '05',
          loop: 1,
          weekdays: ['周一', '周二', '周三', '周四', '周五'],
          dateRange: ['2025-12-29', '2025-12-31'],
          volume: 45,
          location: [['教学楼', '一层', '101音箱']],
          powerOn: true,
          taskLevel: '正常',
          sendMode: '单播',
          playMode: '串行',
          ledSetting: '文字提示'
        }
      ]
    },
    {
      id: 2,
      name: '考试方案',
      status: '停用',
      tasks: []
    }
  ],
  broadcasts: [
    {
      id: 1,
      name: '手动播报-安全提示',
      directory: '校园广播/安全',
      status: '待执行',
      volume: 55,
      emergency: false,
      audio: '安全提示.wav',
      time: '09:00',
      duration: '08',
      loop: 1,
      location: [['教学楼', '一层', '101音箱']]
    },
    {
      id: 2,
      name: '手动播报-集合通知',
      directory: '校园广播/通知',
      status: '执行中',
      volume: 50,
      emergency: false,
      audio: '比赛预告.mp3',
      time: '10:30',
      duration: '05',
      loop: 1,
      location: [['操场', '东侧', '东-1']]
    }
  ],
  livecasts: [
    {
      id: 1,
      name: '体育馆直播',
      status: '启用',
      volume: 48,
      audio: '直播源A',
      time: '14:00',
      duration: '20',
      loop: 1,
      location: [['体育馆', '看台区', '北侧音箱']]
    },
    {
      id: 2,
      name: '操场现场播报',
      status: '停用',
      volume: 38,
      audio: '直播源B',
      time: '16:00',
      duration: '15',
      loop: 1,
      location: [['操场', '西侧', '西-1']]
    }
  ],
  directories: ['校园广播/安全', '校园广播/通知', '校园广播/紧急']
}

export function getDefaultSchedulerData() {
  return JSON.parse(JSON.stringify(defaultData))
}

export function loadSchedulerData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultSchedulerData()
    const parsed = JSON.parse(raw)
    return {
      ...getDefaultSchedulerData(),
      ...parsed,
      directories: parsed.directories || getDefaultSchedulerData().directories
    }
  } catch (e) {
    console.warn('loadSchedulerData failed, fallback to default', e)
    return getDefaultSchedulerData()
  }
}

export function saveSchedulerData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}
