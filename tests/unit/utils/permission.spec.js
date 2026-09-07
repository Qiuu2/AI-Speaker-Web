jest.mock('element-ui', () => ({
  Message: {
    error: jest.fn()
  }
}))

jest.mock('nprogress', () => ({
  configure: jest.fn(),
  start: jest.fn(),
  done: jest.fn()
}))

jest.mock('nprogress/nprogress.css', () => ({}))

jest.mock('@/router', () => ({
  beforeEach: jest.fn(),
  afterEach: jest.fn()
}))

jest.mock('@/store', () => ({
  dispatch: jest.fn(() => Promise.resolve())
}))

jest.mock('@/utils/auth', () => ({
  getToken: jest.fn(() => '')
}))

jest.mock('@/utils/get-page-title', () => jest.fn(() => 'Test Page'))
jest.mock('@/api/license', () => ({
  fetchLicenseStatus: jest.fn(() => Promise.resolve({ activated: true }))
}))

import {
  clearIncomingRemoteAuth,
  extractIncomingRemoteAuth,
  inferRemoteBaseUrlFromLocation
} from '@/permission'

describe('permission remote auth helpers', () => {
  it('infers remote_base_url from the current host and configured port/path', () => {
    expect(inferRemoteBaseUrlFromLocation(
      { protocol: 'http:', hostname: '192.168.1.158' },
      { remoteApiPort: '99', remoteApiPath: '/api' }
    )).toBe('http://192.168.1.158:99/api')
  })

  it('prefers explicit remote_base_url from the URL when present', () => {
    const auth = extractIncomingRemoteAuth(
      { query: {}},
      {
        search: '?token=abc&remote_base_url=http%3A%2F%2F8.8.8.8%3A1234%2Fapi',
        protocol: 'http:',
        hostname: '192.168.1.158'
      },
      { remoteApiPort: '99', remoteApiPath: '/api' }
    )

    expect(auth).toEqual({
      token: 'abc',
      remote_base_url: 'http://8.8.8.8:1234/api'
    })
  })

  it('falls back to inferred remote_base_url when the URL only contains token', () => {
    const auth = extractIncomingRemoteAuth(
      { query: {}},
      {
        search: '?token=abc',
        protocol: 'http:',
        hostname: '192.168.1.158'
      },
      { remoteApiPort: '99', remoteApiPath: '/api' }
    )

    expect(auth).toEqual({
      token: 'abc',
      remote_base_url: 'http://192.168.1.158:99/api'
    })
  })

  it('clears token and remote_base_url from both search and hash query', () => {
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState')
    const locationLike = {
      href: 'http://localhost/?token=abc&remote_base_url=http%3A%2F%2F8.8.8.8%3A1234%2Fapi#/dashboard?token=def&remoteBaseUrl=http%3A%2F%2F1.1.1.1%3A99%2Fapi'
    }

    clearIncomingRemoteAuth(locationLike)

    expect(replaceStateSpy).toHaveBeenCalledTimes(1)
    const replacedUrl = replaceStateSpy.mock.calls[0][2]
    expect(replacedUrl).toBe('http://localhost/#/dashboard')
    replaceStateSpy.mockRestore()
  })
})
