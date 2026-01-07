<template>
  <div class="device-status-page">
    <div class="page-header">
      <div>
        <h2>音响状态概览</h2>
        <p>实时监控区域、组、终端，快速静音或调音，无需跳转设置页。</p>
      </div>
      <div class="header-actions">
        <el-input
          v-model="keyword"
          placeholder="搜索终端或区域"
          prefix-icon="el-icon-search"
          clearable
          size="small"
          class="search-input"
        />
        <el-button type="primary" icon="el-icon-refresh" size="small" @click="refreshData">
          刷新状态
        </el-button>
      </div>
    </div>

    <div class="content">
      <div class="tree-panel card">
        <div class="panel-title">地区 / 组 / 终端</div>
        <el-tree
          :data="treeData"
          node-key="id"
          highlight-current
          default-expand-all
          :props="treeProps"
          @node-click="handleNodeSelect"
        />
        <div class="legend">
          <div v-for="item in statusLegend" :key="item.key" class="legend-item">
            <span :class="['dot', item.key]"></span>
            <span>{{ item.label }}</span>
          </div>
        </div>
      </div>

      <div class="cards-panel card">
        <div class="panel-title">终端状态卡片</div>
        <div v-if="filteredDevices.length" class="card-grid">
          <div
            v-for="device in filteredDevices"
            :key="device.id"
            class="device-card"
            :class="statusClass(device.status)"
          >
            <div class="device-header">
              <div>
                <div class="device-name">{{ device.name }}</div>
                <div class="device-location">{{ device.locationPath }}</div>
              </div>
              <el-tag :type="statusTagType(device.status)" size="mini">
                {{ statusLabel(device.status) }}
              </el-tag>
            </div>

            <div class="device-stats">
              <div class="stat-item">
                <span>当前音量</span>
                <strong>{{ device.volume }}%</strong>
              </div>
              <div class="stat-item">
                <span>连接时长</span>
                <strong>{{ device.uptime }}</strong>
              </div>
            </div>

            <div class="device-actions">
              <el-button
                size="mini"
                type="text"
                icon="el-icon-bell"
                @click="toggleMute(device)"
              >
                {{ device.muted ? '取消静音' : '一键静音' }}
              </el-button>
            </div>
          </div>
        </div>
        <el-empty v-else description="当前筛选下没有终端" />
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'DeviceStatus',
  data() {
    return {
      keyword: '',
      selectedLabel: '',
      treeProps: { children: 'children', label: 'label' },
      treeData: [
        {
          id: 'building-1',
          label: '教学楼',
          children: [
            {
              id: 'floor-1',
              label: '一层',
              children: [
                { id: 'room-101', label: '101音箱' },
                { id: 'room-102', label: '102音箱' }
              ]
            },
            {
              id: 'floor-2',
              label: '二层',
              children: [
                { id: 'room-201', label: '201音箱' },
                { id: 'room-202', label: '202音箱' }
              ]
            }
          ]
        },
        {
          id: 'gym',
          label: '体育馆',
          children: [
            {
              id: 'gym-floor-1',
              label: '看台区',
              children: [
                { id: 'gym-north', label: '北侧音箱' },
                { id: 'gym-south', label: '南侧音箱' }
              ]
            }
          ]
        }
      ],
      devices: [
        {
          id: '101',
          name: '101音箱',
          locationPath: '教学楼 / 一层 / 101音箱',
          status: 'online',
          volume: 38,
          uptime: '02:35:12',
          muted: false
        },
        {
          id: '102',
          name: '102音箱',
          locationPath: '教学楼 / 一层 / 102音箱',
          status: 'playing',
          volume: 42,
          uptime: '00:18:44',
          muted: false
        },
        {
          id: '201',
          name: '201音箱',
          locationPath: '教学楼 / 二层 / 201音箱',
          status: 'offline',
          volume: 0,
          uptime: '—',
          muted: true
        },
        {
          id: '202',
          name: '202音箱',
          locationPath: '教学楼 / 二层 / 202音箱',
          status: 'fault',
          volume: 0,
          uptime: '—',
          muted: true
        },
        {
          id: 'gym-north',
          name: '北侧音箱',
          locationPath: '体育馆 / 看台区 / 北侧音箱',
          status: 'playing',
          volume: 55,
          uptime: '01:05:03',
          muted: false
        },
        {
          id: 'gym-south',
          name: '南侧音箱',
          locationPath: '体育馆 / 看台区 / 南侧音箱',
          status: 'online',
          volume: 35,
          uptime: '03:22:01',
          muted: false
        }
      ],
      statusLegend: [
        { key: 'online', label: '在线' },
        { key: 'offline', label: '离线' },
        { key: 'playing', label: '播放中' },
        { key: 'fault', label: '故障' }
      ]
    }
  },
  computed: {
    filteredDevices() {
      return this.devices.filter((device) => {
        const matchKeyword = this.keyword
          ? device.name.includes(this.keyword) || device.locationPath.includes(this.keyword)
          : true
        const matchLocation = this.selectedLabel ? device.locationPath.includes(this.selectedLabel) : true
        return matchKeyword && matchLocation
      })
    }
  },
  methods: {
    handleNodeSelect(node) {
      this.selectedLabel = node.label
    },
    statusClass(status) {
      return `status-${status}`
    },
    statusLabel(status) {
      switch (status) {
        case 'online':
          return '在线'
        case 'offline':
          return '离线'
        case 'playing':
          return '播放中'
        case 'fault':
          return '故障'
        default:
          return '未知'
      }
    },
    statusTagType(status) {
      if (status === 'online') return 'success'
      if (status === 'offline') return 'info'
      if (status === 'playing') return 'primary'
      if (status === 'fault') return 'danger'
      return 'info'
    },
    toggleMute(device) {
      device.muted = !device.muted
      this.$message.success(`${device.name}已${device.muted ? '静音' : '恢复'}`)
    },
    refreshData() {
      this.$message.success('状态已刷新（示例数据）')
    }
  }
}
</script>

<style lang="scss" scoped>
.device-status-page {
  padding: 24px;
  background: #f6f8fb;
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
    font-size: 22px;
  }

  p {
    margin: 4px 0 0;
    color: #5e6d82;
    font-size: 13px;
  }
}

.header-actions {
  display: flex;
  gap: 8px;
}

.search-input {
  width: 220px;
}

.content {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 16px;
}

.card {
  background: #fff;
  border-radius: 10px;
  padding: 16px;
  box-shadow: 0 8px 20px rgba(31, 45, 61, 0.08);
}

.panel-title {
  font-weight: 600;
  color: #1f2d3d;
  margin-bottom: 12px;
}

.legend {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  color: #5e6d82;
  font-size: 13px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;

  &.online {
    background: #4caf50;
  }
  &.offline {
    background: #c0c4cc;
  }
  &.playing {
    background: #409eff;
    box-shadow: 0 0 0 6px rgba(64, 158, 255, 0.16);
  }
  &.fault {
    background: #f56c6c;
  }
}

.cards-panel {
  min-height: 480px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.device-card {
  border-radius: 12px;
  padding: 14px;
  background: #f7f9fc;
  border: 1px solid #e4e7ed;
  transition: all 0.2s ease;

  &:hover {
    box-shadow: 0 12px 24px rgba(31, 45, 61, 0.12);
    transform: translateY(-2px);
  }
}

.device-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.device-name {
  font-weight: 600;
  color: #1f2d3d;
}

.device-location {
  color: #7a869a;
  font-size: 12px;
  margin-top: 2px;
}

.device-stats {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  color: #5e6d82;
  font-size: 12px;

  strong {
    color: #1f2d3d;
    font-size: 18px;
    margin-top: 4px;
  }
}

.device-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.status-online {
  background: linear-gradient(135deg, #f0fff4 0%, #f7fbf7 100%);
  border-color: #b7eb8f;
}

.status-offline {
  background: linear-gradient(135deg, #f5f7fa 0%, #f2f3f5 100%);
  border-color: #dcdfe6;
  color: #909399;
}

.status-playing {
  background: linear-gradient(135deg, #f0f7ff 0%, #f4f9ff 100%);
  border-color: #b3d8ff;
  position: relative;
  overflow: hidden;
}

.status-playing::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, rgba(64, 158, 255, 0.08) 0%, rgba(255, 255, 255, 0) 60%);
  animation: pulse 2s infinite;
}

.status-fault {
  background: linear-gradient(135deg, #fff5f5 0%, #fff9f9 100%);
  border-color: #fbc4c4;
}

@keyframes pulse {
  0% {
    opacity: 0.35;
  }
  50% {
    opacity: 0.8;
  }
  100% {
    opacity: 0.35;
  }
}
</style>
