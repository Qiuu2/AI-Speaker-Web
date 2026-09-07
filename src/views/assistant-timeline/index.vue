<template>
  <div class="timeline-page">
    <div class="timeline-header">
      <div class="timeline-title">
        <i class="el-icon-time" />
        <span>AI 操作时间轴</span>
      </div>
      <div class="timeline-toolbar">
        <el-radio-group v-model="days" size="small" @change="fetchTimeline">
          <el-radio-button :label="1">今天</el-radio-button>
          <el-radio-button :label="7">近 7 天</el-radio-button>
          <el-radio-button :label="14">近 14 天</el-radio-button>
          <el-radio-button :label="30">近 30 天</el-radio-button>
        </el-radio-group>
        <el-button
          size="small"
          icon="el-icon-refresh"
          :loading="loading"
          plain
          @click="fetchTimeline"
        >
          刷新
        </el-button>
      </div>
    </div>

    <div v-if="loading && !buckets.length" class="timeline-state">
      <i class="el-icon-loading" /> 加载中…
    </div>
    <div v-else-if="error" class="timeline-state timeline-state-error">
      <i class="el-icon-warning-outline" /> {{ error }}
    </div>
    <div v-else-if="!buckets.length" class="timeline-state">
      <i class="el-icon-document" /> 最近 {{ days }} 天没有 AI 操作记录。
    </div>

    <div v-else class="timeline-body">
      <div
        v-for="bucket in buckets"
        :key="bucket.bucket"
        class="timeline-bucket"
      >
        <div class="timeline-bucket-head">
          <span class="timeline-bucket-label">{{ bucket.label }}</span>
          <span class="timeline-bucket-count">{{ bucket.event_count }} 次操作</span>
          <span class="timeline-bucket-date">{{ bucket.bucket }}</span>
        </div>
        <div class="timeline-bucket-body">
          <div
            v-for="(event, idx) in bucket.events"
            :key="`${bucket.bucket}-${idx}`"
            :class="['timeline-event', `outcome-${event.outcome || 'success'}`, { undone: event.undone }]"
            @click="toggleEventDetail(`${bucket.bucket}-${idx}`)"
          >
            <div class="event-row">
              <span class="event-time">{{ formatEventTime(event.started_at) }}</span>
              <span class="event-icon">{{ outcomeIcon(event.outcome) }}</span>
              <span class="event-summary">{{ event.summary || event.intent || 'AI 操作' }}</span>
              <span v-if="event.schedule_name && !event.summary.includes(event.schedule_name)" class="event-schedule">
                「{{ event.schedule_name }}」
              </span>
              <span v-if="event.undone" class="event-tag event-tag-undone">已撤销</span>
              <span v-else-if="event.outcome === 'success_after_retry'" class="event-tag event-tag-retry">
                重试 {{ event.attempts - 1 }} 次后成功
              </span>
              <span v-else-if="event.outcome === 'failure'" class="event-tag event-tag-failure">失败</span>
              <span v-else-if="event.outcome === 'partial_failure'" class="event-tag event-tag-partial">部分失败</span>
            </div>
            <div
              v-if="event.attempts_log && event.attempts_log.length > 1 && expandedKey === `${bucket.bucket}-${idx}`"
              class="event-detail"
            >
              <div
                v-for="(att, attIdx) in event.attempts_log"
                :key="attIdx"
                :class="['event-attempt', `outcome-${att.outcome || 'success'}`]"
              >
                <span class="attempt-time">{{ formatEventTime(att.at) }}</span>
                <span class="attempt-icon">{{ outcomeIcon(att.outcome) }}</span>
                <span class="attempt-text">{{ att.text || att.reply || '—' }}</span>
              </div>
            </div>
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

export default {
  name: 'AssistantTimeline',
  data() {
    return {
      days: 7,
      buckets: [],
      loading: false,
      error: '',
      expandedKey: '',
      window: null
    }
  },
  mounted() {
    this.fetchTimeline()
  },
  methods: {
    async fetchTimeline() {
      this.loading = true
      this.error = ''
      const base = process.env.VUE_APP_BASE_API || ''
      try {
        const { data } = await api.get(`${base}/data/assistant_timeline`, {
          params: { days: this.days, limit_per_bucket: 50, _ts: Date.now() }
        })
        this.buckets = Array.isArray(data && data.buckets) ? data.buckets : []
        this.window = data && data.window
      } catch (err) {
        this.error = (err && err.response && err.response.data && err.response.data.detail)
          || (err && err.message)
          || '时间轴加载失败,请稍后再试。'
        this.buckets = []
      } finally {
        this.loading = false
      }
    },
    outcomeIcon(outcome) {
      return OUTCOME_ICONS[outcome] || '·'
    },
    formatEventTime(text) {
      if (!text) return ''
      // Backend stamps "YYYY-MM-DD HH:MM:SS" — we only want HH:MM in the card.
      const s = String(text).trim()
      if (s.includes(' ')) return s.split(' ', 2)[1].slice(0, 5)
      if (s.includes('T')) return s.split('T', 2)[1].slice(0, 5)
      return s.slice(0, 5)
    },
    toggleEventDetail(key) {
      this.expandedKey = this.expandedKey === key ? '' : key
    }
  }
}
</script>

<style lang="scss" scoped>
.timeline-page {
  padding: 24px;
  max-width: 1100px;
  margin: 0 auto;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.timeline-title {
  font-size: 20px;
  font-weight: 600;
  color: #1f2d3d;
  display: flex;
  align-items: center;
  gap: 8px;

  i {
    color: #4f8cff;
  }
}

.timeline-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.timeline-state {
  padding: 40px 20px;
  text-align: center;
  color: #8492a6;
  font-size: 14px;

  i {
    margin-right: 6px;
  }

  &-error {
    color: #f56c6c;
  }
}

.timeline-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.timeline-bucket {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #eef1f6;
  padding: 14px 18px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.timeline-bucket-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #eef1f6;
}

.timeline-bucket-label {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.timeline-bucket-count {
  font-size: 12px;
  color: #909399;
}

.timeline-bucket-date {
  font-size: 12px;
  color: #c0c4cc;
  margin-left: auto;
}

.timeline-event {
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #f8fbff;
  }

  &.outcome-success { border-left: 3px solid #67c23a; }
  &.outcome-success_after_retry { border-left: 3px solid #e6a23c; }
  &.outcome-partial_failure { border-left: 3px solid #f56c6c; }
  &.outcome-failure { border-left: 3px solid #f56c6c; }
  &.undone { opacity: 0.55; }
}

.event-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.event-time {
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  color: #909399;
  min-width: 42px;
}

.event-icon {
  font-size: 14px;
  font-weight: 700;
  width: 16px;
  text-align: center;

  .outcome-success & { color: #67c23a; }
  .outcome-success_after_retry & { color: #e6a23c; }
  .outcome-partial_failure & { color: #f56c6c; }
  .outcome-failure & { color: #f56c6c; }
}

.event-summary {
  font-size: 14px;
  color: #303133;
}

.event-schedule {
  font-size: 13px;
  color: #606266;
}

.event-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  margin-left: auto;

  &-undone { background: #f4f4f5; color: #909399; }
  &-retry { background: #fdf6ec; color: #e6a23c; }
  &-failure { background: #fef0f0; color: #f56c6c; }
  &-partial { background: #fef0f0; color: #f56c6c; }
}

.event-detail {
  margin-top: 10px;
  padding-left: 50px;
  border-top: 1px dashed #eef1f6;
  padding-top: 10px;
}

.event-attempt {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: #606266;
  padding: 4px 0;

  .attempt-time {
    font-family: 'Monaco', 'Menlo', monospace;
    min-width: 42px;
  }

  .attempt-icon {
    width: 14px;
    text-align: center;
  }

  .attempt-text {
    flex: 1;
  }

  &.outcome-failure .attempt-icon,
  &.outcome-partial_failure .attempt-icon { color: #f56c6c; }
  &.outcome-success .attempt-icon { color: #67c23a; }
}
</style>
