import antfu from '@antfu/eslint-config'

export default antfu({
  rules: {
    'no-console': 'off',
    'test/no-import-node-test': 'off',
  },
})
