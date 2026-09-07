import request from '@/utils/request'

export function login(data) {
  return request({
    url: '/auth/login',
    method: 'post',
    data
  })
}

export function getRemoteBootstrap() {
  return request({
    url: '/auth/remote-bootstrap',
    method: 'get'
  })
}

export function tokenLogin(payload) {
  return request({
    url: '/auth/token-login',
    method: 'post',
    data: typeof payload === 'string' ? { token: payload } : payload
  })
}

export function getInfo() {
  return request({
    url: '/auth/session',
    method: 'get'
  })
}

export function logout() {
  return request({
    url: '/auth/logout',
    method: 'post'
  })
}
