import Vue from 'vue'
import Router from 'vue-router'

Vue.use(Router)

/* Layout */
import Layout from '@/layout'

/**
 * Note: sub-menu only appear when route children.length >= 1
 * Detail see: https://panjiachen.github.io/vue-element-admin-site/guide/essentials/router-and-nav.html
 *
 * hidden: true                   if set true, item will not show in the sidebar(default is false)
 * alwaysShow: true               if set true, will always show the root menu
 *                                if not set alwaysShow, when item has more than one children route,
 *                                it will becomes nested mode, otherwise not show the root menu
 * redirect: noRedirect           if set noRedirect will no redirect in the breadcrumb
 * name:'router-name'             the name is used by <keep-alive> (must set!!!)
 * meta : {
    roles: ['admin','editor']    control the page roles (you can set multiple roles)
    title: 'title'               the name show in sidebar and breadcrumb (recommend set)
    icon: 'svg-name'/'el-icon-x' the icon show in the sidebar
    breadcrumb: false            if set false, the item will hidden in breadcrumb(default is true)
    activeMenu: '/example/list'  if set path, the sidebar will highlight the path you set
  }
 */

/**
 * constantRoutes
 * a base page that does not have permission requirements
 * all roles can be accessed
 */
export const constantRoutes = [
  {
    path: '/login',
    component: () => import('@/views/login/index'),
    hidden: true
  },

  {
    path: '/404',
    component: () => import('@/views/404'),
    hidden: true
  },

  {
    path: '/',
    component: Layout,
    redirect: '/device-status',
    children: [{
      path: 'device-status',
      name: 'DeviceStatus',
      component: () => import('@/views/device-status/index'),
      meta: { title: '音响状态', icon: 'el-icon-mic' }
    }]
  },

  {
    path: '/tasks',
    component: Layout,
    redirect: '/tasks/index',
    children: [{
      path: 'index',
      name: 'TaskManagement',
      component: () => import('@/views/task-management/index'),
      meta: { title: '任务管理', icon: 'el-icon-date' }
    }]
  },

  {
    path: '/scheduler',
    component: Layout,
    redirect: '/scheduler/index',
    children: [{
      path: 'index',
      name: 'TaskScheduler',
      component: () => import('@/views/task-scheduler/index'),
      meta: { title: '任务排程', icon: 'el-icon-edit-outline' }
    }]
  },

  {
    path: '/plans',
    component: Layout,
    redirect: '/plans/index',
    children: [{
      path: 'index',
      name: 'PlanSchemes',
      component: () => import('@/views/plan-schemes/index'),
      meta: { title: '作息方案', icon: 'el-icon-timer' }
    }]
  },

  {
    path: '/file-broadcast',
    component: Layout,
    redirect: '/file-broadcast/index',
    children: [{
      path: 'index',
      name: 'FileBroadcast',
      component: () => import('@/views/file-broadcast/index'),
      meta: { title: '文件广播', icon: 'el-icon-folder' }
    }]
  },

  {
    path: '/live-cast',
    component: Layout,
    redirect: '/live-cast/index',
    children: [{
      path: 'index',
      name: 'LiveCast',
      component: () => import('@/views/live-cast/index'),
      meta: { title: '采播管理', icon: 'el-icon-headset' }
    }]
  },

  // 404 page must be placed at the end !!!
  { path: '*', redirect: '/404', hidden: true }
]

const createRouter = () => new Router({
  // mode: 'history', // require service support
  scrollBehavior: () => ({ y: 0 }),
  routes: constantRoutes
})

const router = createRouter()

// Detail see: https://github.com/vuejs/vue-router/issues/1234#issuecomment-357941465
export function resetRouter() {
  const newRouter = createRouter()
  router.matcher = newRouter.matcher // reset router
}

export default router
