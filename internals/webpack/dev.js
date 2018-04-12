
const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const glob = require('glob');
const AddAssetHtmlPlugin = require('add-asset-html-webpack-plugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const dllPlugin = require(path.resolve(process.cwd(), 'package.json')).dllPlugin;

const plugins = [
  new webpack.HotModuleReplacementPlugin(), // Tell webpack we want hot reloading
  new webpack.NoEmitOnErrorsPlugin(),
  new HtmlWebpackPlugin({
    inject: true, // Inject all files that are generated by webpack, e.g. bundle.js
    template: 'app/index.html',
  }),
  new CircularDependencyPlugin({
    exclude: /a\.js|node_modules/, // exclude node_modules
    failOnError: false, // show a warning when there is a circular dependency
  }),
];

if (dllPlugin) {
  glob.sync(`${dllPlugin.path}/*.dll.js`).forEach((dllPath) => plugins.push(
    new AddAssetHtmlPlugin({
      filepath: dllPath,
      includeSourcemap: false,
    })
  ));
}

function dependencyHandlers() {
  if (process.env.BUILDING_DLL) return []; // Don't do anything during the DLL Build step
  const dllPath = path.resolve(process.cwd(), dllPlugin.path || 'internals/dll');
  const manifestPath = path.resolve(dllPath, 'generatedDependencies.json');
  const dllReferencePlugin = [
    new webpack.DllReferencePlugin({
      context: process.cwd(),
      manifest: require(manifestPath), // eslint-disable-line global-require
    }),
  ];

  if (!dllPlugin.dlls) { /* exclude any server side dependencies by listing them in dllConfig.exclude */
    if (!fs.existsSync(manifestPath)) {
      console.error('The DLL manifest is missing. Please run `npm run build:dll`');
      process.exit(0);
    }
    return dllReferencePlugin;
  }

  // If DLLs are explicitly defined, we automatically create a DLLReferencePlugin for each of them.
  const dllManifests = Object.keys(dllPlugin.dlls).map((name) => path.join(dllPath, `/${name}.json`));
  return dllManifests.map((manifestPath) => {
    if (!fs.existsSync(path) && !fs.existsSync(manifestPath)) {
      console.error(`The following Webpack DLL manifest is missing: ${path.basename(manifestPath)}`);
      console.error(`Expected to find it in ${dllPath}`);
      console.error('Please run: npm run build:dll');
      process.exit(0);
    }
    return dllReferencePlugin;
  });
}

module.exports = require('./base')({
  entry: [ // Add hot reloading in development
    // 'eventsource-polyfill', // Necessary for hot reloading with IE
    'webpack-hot-middleware/client?reload=true',
    path.join(process.cwd(), 'app/index.js'), // Start with app/index.js
  ],
  output: {
    filename: '[name].js', // Don't use hashes in dev mode for better performance
    chunkFilename: '[name].chunk.js',
  },
  plugins: dependencyHandlers().concat(plugins),
  devtool: 'eval-source-map', // Emit a source map for easier debugging. See https://webpack.js.org/configuration/devtool/#devtool
  performance: { hints: false },
});