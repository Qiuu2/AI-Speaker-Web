<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>作息方案</h2>
        <p>数据来自“任务编排”保存的方案。需要修改请前往任务编排页调整。</p>
      </div>
      <el-button size="small" icon="el-icon-refresh" @click="loadData">刷新</el-button>
    </div>
    <el-table :data="plans" border size="small">
      <el-table-column type="expand">
        <template slot-scope="{ row }">
          <el-table :data="row.tasks" size="mini" border>
            <el-table-column type="index" width="40" />
            <el-table-column prop="audio" label="音频资源" />
            <el-table-column prop="time" label="时间" width="100" />
            <el-table-column prop="duration" label="时长(分)" width="90" />
            <el-table-column prop="loop" label="循环" width="70" />
            <el-table-column label="周期" min-width="140">
              <template slot-scope="{ row: task }">
                {{ (task.weekdays || []).join('、') }}
              </template>
            </el-table-column>
            <el-table-column label="时效" min-width="160">
              <template slot-scope="{ row: task }">
                {{ (task.dateRange || []).join(' 至 ') }}
              </template>
            </el-table-column>
            <el-table-column prop="location" label="终端地点" />
            <el-table-column prop="volume" label="音量" width="80" />
          </el-table>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="方案名称" />
      <el-table-column label="任务数" width="80">
        <template slot-scope="{ row }">
          {{ (row.tasks && row.tasks.length) || 0 }}
        </template>
      </el-table-column>
      <el-table-column prop="volume" label="音量" width="80" />
      <el-table-column prop="status" label="状态" width="90">
        <template slot-scope="{ row }">
          <el-tag :type="row.status === '启用' ? 'success' : 'info'" size="mini">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script>
import { loadSchedulerData } from '@/utils/schedulerStorage'

export default {
  name: 'PlanSchemes',
  data() {
    return {
      plans: []
    }
  },
  created() {
    this.loadData()
  },
  methods: {
    loadData() {
      this.plans = loadSchedulerData().plans || []
      this.$message.success('已从任务编排同步方案数据')
    }
  }
}
</script>

<style lang="scss" scoped>
.page {
  padding: 24px;
  background: #f5f7fb;
  min-height: 100%;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

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
</style>
