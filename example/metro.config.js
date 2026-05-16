// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const packageRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

// Block the parent package's nested copies of react / react-native so Metro
// resolves a single instance from the example's node_modules.
config.resolver.blockList = [
  ...Array.from(config.resolver.blockList ?? []),
  new RegExp(path.resolve(packageRoot, 'node_modules', 'react') + '/.*'),
  new RegExp(path.resolve(packageRoot, 'node_modules', 'react-native') + '/.*'),
]

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(packageRoot, 'node_modules'),
]

config.resolver.extraNodeModules = {
  'react-native-nitro-keepalive-timer': packageRoot,
}

config.watchFolders = [packageRoot]

module.exports = config
