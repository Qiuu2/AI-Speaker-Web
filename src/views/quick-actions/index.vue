<template>
  <div class="quick-page">
    <div class="quick-header">
      <div class="quick-title">
        <i class="el-icon-magic-stick" />
        <span>快捷面板</span>
      </div>
      <el-button
        size="small"
        icon="el-icon-refresh"
        :loading="loading"
        plain
        @click="fetchAll"
      >
        刷新
      </el-button>
    </div>

    <div class="quick-grid">
      <!-- 常用 -->
      <div class="quick-card">
        <div class="card-head">
          <i class="el-icon-star-on" />
          <span>常用</span>
          <span v-if="hasDefaults" class="card-sub">基于历史命令</span>
        </div>
        <div v-if="loading && !hasDefaults" class="card-empty">加载中…</div>
        <div v-else-if="!hasDefaults" class="card-empty">还没有使用偏好,多用几次 AI 后这里会出现。</div>
        <div v-else class="card-body">
          <div v-if="defaults.schedule_name" class="quick-row">
            <span class="quick-label">常用作息</span>
            <span class="quick-value">「{{ defaults.schedule_name }}」</span>
          </div>
          <div v-if="defaults.zone_name" class="quick-row">
            <span class="quick-label">常用分区</span>
            <span class="quick-value">{{ defaults.zone_name }}</span>
          </div>
          <div v-if="defaults.terminal_name" class="quick-row">
            <span class="quick-label">常用终端</span>
            <span class="quick-value">{{ defaults.terminal_name }}</span>
          </div>
          <div v-if="defaults.media_name" class="quick-row">
            <span class="quick-label">常用音频</span>
            <span class="quick-value">{{ defaults.media_name }}</span>
          </div>
          <div v-if="defaults.volume_p50 != null" class="quick-row">
            <span class="quick-label">常用音量</span>
            <span class="quick-value">{{ defaults.volume_p50 }} %</span>
          </div>
          <div v-if="defaults.time_of_day" class="quick-row">
            <span class="quick-label">活跃时段</span>
            <span class="quick-value">{{ timeOfDayLabel(defaults.time_of_day) }}</span>
          </div>
        </div>
      </div>

      <!-- 最近 -->
      <div class="quick-card">
        <div class="card-head">
          <i class="el-icon-time" />
          <span>最近操作</span>
          <router-link v-if="recent.length" to="/assistant-timeline" class="card-more">看完整时间轴 →</router-link>
        </div>
        <div v-if="loading && !recent.length" class="card-empty">加载中…</div>
        <div v-else-if="!recent.length" class="card-empty">最近没有 AI 操作。</div>
        <div v-else class="card-body">
          <div
            v-for="(item, idx) in recent.slice(0, 5)"
            :key="idx"
            :class="['recent-row', `outcome-${item.outcome || 'success'}`]"
          >
            <span class="recent-icon">{{ outcomeIcon(item.outcome) }}</span>
            <span class="recent-text" :title="item.text">{{ item.text || item.intent || 'AI 操作' }}</span>
            <span class="recent-time">{{ formatRelativeTime(item.created_at) }}</span>
          </div>
        </div>
      </div>

      <!-- 正在进行 -->
      <div class="quick-card">
        <div class="card-head">
          <i class="el-icon-video-play" />
          <span>正在进行</span>
          <span v-if="runtimeTasks.length" class="card-sub">{{ runtimeTasks.length }} 个</span>
        </div>
        <div v-if="loading && !runtimeTasks.length" class="card-empty">加载中…</div>
        <div v-else-if="!runtimeTasks.length" class="card-empty">当前没有正在播放的任务。</div>
        <div v-else class="card-body">
          <div
            v-for="(task, idx) in runtimeTasks.slice(0, 6)"
            :key="task.task_id || task.id || idx"
            class="runtime-row"
          >
            <span class="runtime-icon">▶</span>
            <div class="runtime-content">
              <div class="runtime-title">{{ task.task_name || task.media_name || task.audio || '未命名任务' }}</div>
              <div class="runtime-meta">
                <span v-if="task.terminal_names && task.terminal_names.length">
                  {{ task.terminal_names.slice(0, 3).join('、') }}{{ task.terminal_names.length > 3 ? '…' : '' }}
                </span>
                <span v-if="task.volume != null" class="runtime-vol">音量 {{ task.volume }}</span>
              </div>
            </div>
            <el-button
              size="mini"
              type="danger"
              plain
              :loading="stoppingTaskId === (task.task_id || task.id)"
              @click="stopRuntime(task)"
            >
              停止
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios'
import { getToken } from '@/utils/auth'

const api = axios.create({ timeout: 30000 })
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers['X-Token'] = token
  }
  return config
})

const OUTCOME_ICONS = {
  success: '✓',
  success_after_retry: '↻',
  partial_failure: '⚠',
  failure: '✗'
}

const TIME_OF_DAY_LABELS = {
  morning: '早间(5–11 点)',
  midday: '午间(11–14 点)',
  afternoon: '下午(14–18 点)',
  evening: '傍晚之后(18 点+)'
}

export default {
  name: 'QuickActions',
  data() {
    return {
      loading: false,
      defaults: {},
      recent: [],
      runtimeTasks: [],
      stoppingTaskId: ''
    }
  },
  computed: {
    hasDefaults() {
      const d = this.defaults || {}
      return Boolean(
        d.schedule_name || d.zone_name || d.terminal_name || d.media_name
          || d.volume_p50 != null || d.time_of_day
      )
    }
  },
  mounted() {
    this.fetchAll()
  },
  methods: {
    async fetchAll() {
      this.loading = true
      const base = process.env.VUE_APP_BASE_API || ''
      const ts = Date.now()
      // Three independent fetches — each failure is decoration-only,
      // doesn't block the others. Promise.allSettled keeps the page
      // usable when one endpoint is degraded.
      const [defaultsRes, recentRes, runtimeRes] = await Promise.allSettled([
        api.get(`${base}/data/assistant_defaults`, { params: { _ts: ts } }),
        api.get(`${base}/data/assistant_command_logs`, { params: { limit: 8, _ts: ts } }),
        api.get(`${base}/data/runtime_play_tasks`, { params: { _ts: ts } })
      ])
      this.defaults = defaultsRes.status === 'fulfilled'
        ? (defaultsRes.value.data || {})
        : {}
      this.recent = recentRes.status === 'fulfilled'
        ? (Array.isArray(recentRes.value.data && recentRes.value.data.items)
          ? recentRes.value.data.items : [])
        : []
      const runtimePayload = runtimeRes.status === 'fulfilled' ? runtimeRes.value.data : null
      this.runtimeTasks = this.extractRuntimeTasks(runtimePayload)
      this.loading = false
    },
    extractRuntimeTasks(payload) {
      if (!payload) return []
      // Backend returns either {items: [...]} or {tasks: [...]} depending
      // on the dispatch path — accept both shapes.
      const candidates = []
      if (Array.isArray(payload.items)) candidates.push(...payload.items)
      if (Array.isArray(payload.tasks)) candidates.push(...payload.tasks)
      if (!candidates.length && Array.isArray(payload)) candidates.push(...payload)
      return candidates.filter((item) => item && typeof item === 'object')
    },
    outcomeIcon(outcome) {
      return OUTCOME_ICONS[outcome] || '·'
    },
    timeOfDayLabel(text) {
      return TIME_OF_DAY_LABELS[text] || text
    },
    formatRelativeTime(text) {
      if (!text) return ''
      const ts = Date.parse(String(text).replace(' ', 'T'))
      if (isNaN(ts)) return text
      const diffMs = Date.now() - ts
      const min = Math.floor(diffMs / 60000)
      if (min < 1) return '刚刚'
      if (min < 60) return `${min} 分钟前`
      const hr = Math.floor(min / 60)
      if (hr < 24) return `${hr} 小时前`
      const day = Math.floor(hr / 24)
      if (day < 30) return `${day} 天前`
      return text.slice(0, 10)
    },
    async stopRuntime(task) {
      const id = String(task.task_id || task.id || '').trim()
      if (!id) return
      this.stoppingTaskId = id
      const base = process.env.VUE_APP_BASE_API || ''
      try {
        await api.post(`${base}/data/runtime_play_tasks/stop`, { task_ids: [id] })
        this.$message({ type: 'success', message: '已停止。', duration: 1500 })
        // Optimistic local removal so the row disappears immediately;
        // background refresh reconciles authoritative state.
        this.runtimeTasks = this.runtimeTasks.filter((t) =>
          String(t.task_id || t.id || '') !== id
        )
        setTimeout(() => this.fetchAll(), 800)
      } catch (err) {
        const message = (err && err.response && err.response.data && err.response.data.detail)
          || (err && err.message) || '停止失败,请稍后再试。'
        this.$message({ type: 'error', message: String(message), duration: 3000 })
      } finally {
        this.stoppingTaskId = ''
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.quick-page {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.quick-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.quick-title {
  font-size: 20px;
  font-weight: 600;
  color: #1f2d3d;
  display: flex;
  align-items: center;
  gap: 8px;

  i { color: #4f8cff; }
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.quick-card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #eef1f6;
  padding: 14px 18px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.card-head {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px dashed #eef1f6;
  margin-bottom: 10px;

  i { color: #4f8cff; }
}

.card-sub {
  font-size: 11px;
  color: #909399;
  font-weight: 400;
  margin-left: 4px;
}

.card-more {
  margin-left: auto;
  font-size: 12px;
  color: #4f8cff;
  text-decoration: none;
  font-weight: 400;

  &:hover { text-decoration: underline; }
}

.card-empty {
  font-size: 13px;
  color: #909399;
  text-align: center;
  padding: 20px 0;
}

.card-body { padding-top: 4px; }

.quick-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 6px 0;
  border-bottom: 1px dotted #f4f4f5;

  &:last-child { border-bottom: none; }
}

.quick-label {
  color: #909399;
}

.quick-value {
  color: #303133;
  font-weight: 500;
}

.recent-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 6px 0;
  border-bottom: 1px dotted #f4f4f5;

  &:last-child { border-bottom: none; }

  &.outcome-failure .recent-icon,
  &.outcome-partial_failure .recent-icon { color: #f56c6c; }
  &.outcome-success_after_retry .recent-icon { color: #e6a23c; }
  &.outcome-success .recent-icon { color: #67c23a; }
}

.recent-icon {
  width: 14px;
  text-align: center;
  font-weight: 700;
}

.recent-text {
  flex: 1;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-time {
  font-size: 11px;
  color: #c0c4cc;
}

.runtime-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dotted #f4f4f5;

  &:last-child { border-bottom: none; }
}

.runtime-icon {
  color: #67c23a;
  font-size: 12px;
  width: 14px;
  text-align: center;
}

.runtime-content {
  flex: 1;
  min-width: 0;
}

.runtime-title {
  font-size: 13px;
  color: #303133;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-meta {
  font-size: 11px;
  color: #909399;
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.runtime-vol {
  color: #c0c4cc;
}
</style>
