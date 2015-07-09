System.config({
  "transpiler": "babel",
  "babelOptions": {
    "optional": [
      "es7.decorators",
	  "es7.classProperties",
      "runtime"
    ]
  },
  "paths": {
    "*": "*.js",
    "github:*": "jspm_packages/github/*.js",
    "npm:*": "jspm_packages/npm/*.js",
    "bower:*": "jspm_packages/bower/*.js"
  }
});

System.config({
  "map": {
    "async": "bower:async@1.3.0",
    "babel": "npm:babel-core@5.6.16",
    "babel-runtime": "npm:babel-runtime@5.6.16",
    "browser-request": "npm:browser-request@0.3.3",
    "core-js": "npm:core-js@0.8.4",
    "handlebars": "github:components/handlebars.js@3.0.3",
    "lodash": "npm:lodash@3.10.0",
    "github:jspm/nodelibs-process@0.1.1": {
      "process": "npm:process@0.10.1"
    },
    "npm:babel-runtime@5.6.16": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:browser-request@0.3.3": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:core-js@0.8.4": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:lodash@3.10.0": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    }
  }
});

