<template>
  <div class="task-management-page">
    <div class="page-header">
      <div>
        <h2>任务管理</h2>
        <p>按时间线查看广播任务，快速识别进行、排队与冲突状态。</p>
      </div>
      <div class="header-actions">
        <el-date-picker
          v-model="selectedDate"
          type="date"
          value-format="timestamp"
          placeholder="选择日期"
          size="small"
          :clearable="false"
          @change="handleDateChange"
        />
        <el-button size="small" @click="goToday">回到今日</el-button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card total">
        <p>今日任务</p>
        <strong>{{ stats.total }}</strong>
      </div>
      <div class="stat-card running">
        <p>进行中</p>
        <strong>{{ stats.running }}</strong>
      </div>
      <div class="stat-card pending">
        <p>待执行</p>
        <strong>{{ stats.queued }}</strong>
      </div>
      <div class="stat-card warning">
        <p>异常 / 冲突</p>
        <strong>{{ stats.issue }}</strong>
      </div>
    </div>

    <div class="timeline-card card">
      <div class="card-title">时间线</div>
      <div v-if="tasksForDay.length" class="timeline-list">
        <div
          v-for="task in tasksForDay"
          :key="task.id"
          class="timeline-item"
          :class="{ conflict: task.conflict }"
        >
          <div class="time-block">
            <div class="time">{{ task.time }}</div>
            <div class="duration">时长 {{ task.duration }} 分钟</div>
          </div>
          <div class="content-block">
            <div class="title-row">
              <span class="task-title">{{ task.audio }}</span>
              <div class="tags">
                <el-tag :type="tagType(task.status)" size="mini">
                  {{ statusLabel(task.status) }}
                </el-tag>
                <el-tag v-if="task.conflict" type="danger" size="mini" effect="dark">冲突预警</el-tag>
              </div>
            </div>
            <div class="meta">
              <span>播放区域：{{ task.area }}</span>
              <span>音频来源：{{ task.source }}</span>
            </div>
            <div class="note" v-if="task.note">
              {{ task.note }}
            </div>
          </div>
        </div>
      </div>
      <el-empty v-else description="当日暂无任务" />
    </div>
  </div>
</template>

<script>
export default {
  name: 'TaskManagement',
  data() {
    const today = new Date()
    return {
      selectedDate: today.getTime(),
      tasks: [
        {
          id: 1,
          date: this.formatDate(today),
          time: '07:45',
          duration: 5,
          audio: '早操集合提示',
          area: '教学楼全区',
          status: 'playing',
          source: '自动计划',
          note: '保持背景音量不超过45%'
        },
        {
          id: 2,
          date: this.formatDate(today),
          time: '08:10',
          duration: 10,
          audio: '升旗仪式',
          area: '操场西侧',
          status: 'queued',
          source: '教务处',
          note: '需覆盖全场，优先级高'
        },
        {
          id: 3,
          date: this.formatDate(today),
          time: '08:12',
          duration: 8,
          audio: '课间背景乐',
          area: '操场西侧',
          status: 'queued',
          source: '自动计划',
          note: ''
        },
        {
          id: 4,
          date: this.formatDate(today),
          time: '12:30',
          duration: 20,
          audio: '午间广播',
          area: '教学楼一层',
          status: 'done',
          source: 'AI 预排',
          note: '与宿舍区任务串联'
        },
        {
          id: 5,
          date: this.formatDate(today),
          time: '18:00',
          duration: 15,
          audio: '放学安全提示',
          area: '校门口',
          status: 'done',
          source: '自动计划',
          note: ''
        },
        {
          id: 6,
          date: this.formatDate(today),
          time: '18:05',
          duration: 12,
          audio: '紧急通告',
          area: '教学楼全区',
          status: 'issue',
          source: '手动插播',
          note: '信号波动，请检查线路'
        }
      ]
    }
  },
  computed: {
    currentDateKey() {
      return this.formatDate(new Date(this.selectedDate))
    },
    tasksForDay() {
      const list = this.tasks
        .filter((task) => task.date === this.currentDateKey)
        .map((task) => ({
          ...task,
          conflict: this.hasConflict(task)
        }))
        .sort((a, b) => this.timeToMinutes(a.time) - this.timeToMinutes(b.time))
      return list
    },
    stats() {
      const total = this.tasksForDay.length
      const running = this.tasksForDay.filter((t) => t.status === 'playing').length
      const queued = this.tasksForDay.filter((t) => t.status === 'queued').length
      const issue = this.tasksForDay.filter((t) => t.status === 'issue' || t.conflict).length
      return { total, running, queued, issue }
    }
  },
  methods: {
    formatDate(date) {
      const d = new Date(date)
      const y = d.getFullYear()
      const m = `${d.getMonth() + 1}`.padStart(2, '0')
      const day = `${d.getDate()}`.padStart(2, '0')
      return `${y}-${m}-${day}`
    },
    timeToMinutes(time) {
      const [h, m] = time.split(':').map((x) => parseInt(x, 10))
      return h * 60 + m
    },
    hasConflict(target) {
      const targetStart = this.timeToMinutes(target.time)
      const targetEnd = targetStart + target.duration
      return this.tasks.some((task) => {
        if (task.id === target.id || task.date !== target.date || task.area !== target.area) return false
        const start = this.timeToMinutes(task.time)
        const end = start + task.duration
        return start < targetEnd && targetStart < end
      })
    },
    statusLabel(status) {
      if (status === 'done') return '已完成'
      if (status === 'playing') return '正在播放'
      if (status === 'queued') return '排队中'
      if (status === 'issue') return '异常'
      return '未知'
    },
    tagType(status) {
      if (status === 'done') return 'success'
      if (status === 'playing') return 'primary'
      if (status === 'queued') return 'info'
      if (status === 'issue') return 'danger'
      return 'info'
    },
    goToday() {
      this.selectedDate = new Date().getTime()
    },
    handleDateChange() {
      // 占位：日期变化时可拉取新数据
    }
  }
}
</script>

<style lang="scss" scoped>
.task-management-page {
  padding: 24px;
  background: #f5f7fb;
  min-height: 100%;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;

  h2 {
    margin: 0;
    color: #1f2d3d;
  }

  p {
    margin: 4px 0 0;
    color: #5e6d82;
    font-size: 13px;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  padding: 14px 16px;
  border-radius: 12px;
  color: #1f2d3d;
  background: #fff;
  box-shadow: 0 10px 24px rgba(31, 45, 61, 0.08);

  p {
    margin: 0;
    color: #5e6d82;
  }

  strong {
    display: block;
    margin-top: 6px;
    font-size: 24px;
  }

  &.total strong {
    color: #1f2d3d;
  }
  &.running strong {
    color: #409eff;
  }
  &.pending strong {
    color: #67c23a;
  }
  &.warning strong {
    color: #f56c6c;
  }
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 8px 20px rgba(31, 45, 61, 0.08);
}

.card-title {
  font-weight: 600;
  color: #1f2d3d;
  margin-bottom: 12px;
}

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-item {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #e4e7ed;
  background: linear-gradient(135deg, #f9fbff 0%, #ffffff 100%);
  position: relative;
}

.timeline-item::before {
  content: '';
  position: absolute;
  left: 75px;
  top: 12px;
  width: 2px;
  height: calc(100% - 24px);
  background: #e4e7ed;
}

.timeline-item.conflict {
  border-color: #fcb7b7;
  background: #fff6f6;
}

.time-block {
  position: relative;
  z-index: 1;
}

.time {
  font-size: 20px;
  font-weight: 600;
  color: #1f2d3d;
}

.duration {
  color: #909399;
  font-size: 12px;
}

.content-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-title {
  font-weight: 600;
  color: #1f2d3d;
}

.tags {
  display: flex;
  gap: 6px;
  align-items: center;
}

.meta {
  color: #5e6d82;
  font-size: 13px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

.note {
  color: #f56c6c;
  font-size: 13px;
}
</style>
