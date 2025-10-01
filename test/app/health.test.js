import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from '../helper.js'

test('Test Setup', (t, done) => {
  assert.equal(true, true, 'Tests and assertions should work')
  done()
})

test('Healthcheck', async (t) => {
  const app = await build(t)
  const { PREFIX } = app.config

  t.test('a valid GET Request', (t, done) => {
    app.inject(
      {
        method: 'GET',
        url: `${PREFIX}/health`,
      },
      (e, response) => {
        assert.ok(!e)
        assert.equal(response.statusCode, 200, 'response ok')
        assert.deepEqual(
          JSON.parse(response.body),
          { status: 'ok' },
          'payload ok',
        )
        done()
      },
    )
  })
})
