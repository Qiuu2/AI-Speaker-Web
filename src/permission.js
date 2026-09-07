import { Message } from 'element-ui'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

import router from './router'
import store from './store'
import { getToken } from '@/utils/auth'
import { isAuthSessionUnauthorized, mapHttpErrorToUserMessage } from '@/utils/httpError'
import getPageTitle from '@/utils/get-page-title'
import { fetchLicenseStatus } from '@/api/license'
import defaultSettings from '@/settings'

NProgress.configure({ showSpinner: false })

const whiteList = ['/login', '/404']
const REMOTE_BASE_URL_KEYS = ['remote_base_url', 'remoteBaseUrl']

function extractValueFromSearchParams(params, key) {
  if (!(params instanceof URLSearchParams)) return ''
  const value = params.get(key)
  return value ? String(value).trim() : ''
}

function normalizeRemoteApiPath(path) {
  const text = String(path || '').trim()
  if (!text) return '/api'
  const normalized = text.startsWith('/') ? text : `/${text}`
  return normalized.replace(/\/+$/, '') || '/'
}

export function inferRemoteBaseUrlFromLocation(locationLike = window.location, settings = defaultSettings) {
  const protocol = String(locationLike?.protocol || '').trim()
  const hostname = String(locationLike?.hostname || '').trim()
  const port = String(settings?.remoteApiPort || '').trim()
  const path = normalizeRemoteApiPath(settings?.remoteApiPath)
  if (!protocol || !hostname) return ''
  return `${protocol}//${hostname}${port ? `:${port}` : ''}${path}`
}

function extractIncomingRemoteBaseUrl(to, locationLike = window.location) {
  const searchParams = new URLSearchParams(locationLike.search || '')
  for (const key of REMOTE_BASE_URL_KEYS) {
    const searchValue = extractValueFromSearchParams(searchParams, key)
    if (searchValue) return searchValue
  }
  if (to && to.query) {
    for (const key of REMOTE_BASE_URL_KEYS) {
      const routeValue = to.query[key]
      if (routeValue) return String(routeValue).trim()
    }
  }
  return ''
}

export function extractIncomingRemoteAuth(to, locationLike = window.location, settings = defaultSettings) {
  const searchParams = new URLSearchParams(locationLike.search || '')
  const searchToken = extractValueFromSearchParams(searchParams, 'token')
  const routeToken = to && to.query && to.query.token ? String(to.query.token).trim() : ''
  const token = searchToken || routeToken
  if (!token) {
    return { token: '', remote_base_url: '' }
  }
  const explicitRemoteBaseUrl = extractIncomingRemoteBaseUrl(to, locationLike)
  return {
    token,
    remote_base_url: explicitRemoteBaseUrl || inferRemoteBaseUrlFromLocation(locationLike, settings)
  }
}

export function clearIncomingRemoteAuth(locationLike = window.location) {
  const href = String(locationLike?.href || window.location.href || '')
  if (!href) return
  const url = new URL(href)
  let changed = false
  if (url.searchParams.has('token')) {
    url.searchParams.delete('token')
    changed = true
  }
  for (const key of REMOTE_BASE_URL_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      changed = true
    }
  }
  if (url.hash && url.hash.includes('?')) {
    const hashText = url.hash.slice(1)
    const [hashPath, hashQuery = ''] = hashText.split('?')
    const hashParams = new URLSearchParams(hashQuery)
    if (hashParams.has('token')) {
      hashParams.delete('token')
      changed = true
    }
    for (const key of REMOTE_BASE_URL_KEYS) {
      if (hashParams.has(key)) {
        hashParams.delete(key)
        changed = true
      }
    }
    const nextHashQuery = hashParams.toString()
    url.hash = nextHashQuery ? `#${hashPath}?${nextHashQuery}` : `#${hashPath}`
  }
  if (changed) {
    window.history.replaceState({}, '', url.toString())
  }
}

function loginRedirect(fullPath) {
  return `/login?redirect=${encodeURIComponent(fullPath || '/')}`
}

function licenseRedirect(fullPath) {
  return `/license?redirect=${encodeURIComponent(fullPath || '/')}`
}

router.beforeEach(async(to, from, next) => {
  NProgress.start()
  document.title = getPageTitle(to.meta.title)

  const incomingAuth = extractIncomingRemoteAuth(to)
  if (incomingAuth.token) {
    try {
      await store.dispatch('user/tokenLogin', incomingAuth)
      clearIncomingRemoteAuth()
    } catch (error) {
      await store.dispatch('user/resetToken')
      Message.error(
        mapHttpErrorToUserMessage(error, {
          scene: 'generic',
          fallbackText: 'Token 无效或已失效，请重新登录'
        })
      )
      if (to.path === '/login') {
        next()
      } else {
        next(loginRedirect(to.fullPath))
      }
      NProgress.done()
      return
    }
  }

  const hasToken = Boolean(getToken())
  if (!hasToken) {
    if (whiteList.indexOf(to.path) !== -1) {
      next()
    } else {
      next(loginRedirect(to.fullPath))
      NProgress.done()
    }
    return
  }

  try {
    await store.dispatch('user/getInfo')
    const status = await fetchLicenseStatus()
    const activated = Boolean(status && status.activated)

    if (!activated) {
      if (to.path === '/license') {
        next()
      } else {
        next(licenseRedirect(to.fullPath))
        NProgress.done()
      }
      return
    }

    if (to.path === '/login' || to.path === '/license') {
      const redirect = (to.query && to.query.redirect) ? decodeURIComponent(to.query.redirect) : '/'
      next(redirect || '/')
      NProgress.done()
      return
    }

    next()
  } catch (error) {
    await store.dispatch('user/resetToken')
    const message = mapHttpErrorToUserMessage(error, {
      scene: isAuthSessionUnauthorized(error) ? 'auth_session' : 'generic',
      fallbackText: '登录状态校验失败，请重新登录'
    })
    Message.error(message)
    if (to.path === '/login') {
      next()
    } else {
      next(loginRedirect(to.fullPath))
      NProgress.done()
    }
  }
})

router.afterEach(() => {
  NProgress.done()
})
