jest.mock('@/api/user', () => ({
  getInfo: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  tokenLogin: jest.fn(() => Promise.resolve({
    data: {
      token: 'local-session-token',
      name: 'Token User',
      avatar: ''
    }
  }))
}))

jest.mock('@/utils/auth', () => ({
  getToken: jest.fn(() => ''),
  setToken: jest.fn(),
  removeToken: jest.fn()
}))

jest.mock('@/router', () => ({
  resetRouter: jest.fn()
}))

import userModule from '@/store/modules/user'
import { tokenLogin as loginWithToken } from '@/api/user'

describe('user store tokenLogin', () => {
  it('forwards token and remote_base_url to /auth/token-login', async() => {
    const commit = jest.fn()

    await userModule.actions.tokenLogin({ commit }, {
      token: 'remote-token',
      remote_base_url: 'http://192.168.1.158:99/api'
    })

    expect(loginWithToken).toHaveBeenCalledWith({
      token: 'remote-token',
      remote_base_url: 'http://192.168.1.158:99/api'
    })
  })
})
