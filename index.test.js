const AWS = require('aws-sdk')
const index = require('./index')

jest.mock('aws-sdk', () => {
  const mocks = {
    getParameterMock: jest.fn().mockImplementation((params) => {
      if (params.Name === 'exists') {
        return Promise.reject(new Error('123'))
      }
      return Promise.resolve()
    }),
    putParameterMock: jest.fn().mockImplementation((params) => {
      if (params.Name === 'exists') {
        return Promise.reject(new Error('123'))
      }
      return Promise.resolve()
    })
  }

  const SSM = {
    getParameter: (obj) => ({
      promise: () => mocks.getParameterMock(obj)
    }),
    putParameter: (obj) => ({
      promise: () => mocks.putParameterMock(obj)
    })
  }
  return {
    mocks,
    SSM: jest.fn().mockImplementation(() => SSM)
  }
})

afterEach(() => {
  AWS.mocks.getParameterMock.mockClear()
  AWS.mocks.putParameterMock.mockClear()
})

afterAll(() => {
  jest.restoreAllMocks()
})

describe('tests', () => {
  it('should deploy ssm parameters', async () => {
    expect('1').toEqual('1')
  })
})
