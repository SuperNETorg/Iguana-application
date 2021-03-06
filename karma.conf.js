// TODO: 1) add $state.go mock to tests
//       2) add extended coind/iguana fixture responses
module.exports = function(config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', 'fixture'],
    preprocessors: {
      '**/*.html': ['ng-html2js'],
      '**/*.json': ['json_fixtures']
    },
    jsonFixturesPreprocessor: {
      variableName: '__json__'
    },
    ngHtml2JsPreprocessor: {
      moduleName: 'templates'
    },
    reporters: ['spec'],
    port: 65009,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ['Chrome'],
    singleRun: false,
    concurrency: Infinity,
    files: [
      'bower_components/angular/angular.js',
      'bower_components/angular-ui-router/release/angular-ui-router.js',
      'bower_components/angular-md5/angular-md5.js',
      'bower_components/angular-sanitize/angular-sanitize.js',
      'bower_components/angular-animate/angular-animate.js',
      'bower_components/angular-bootstrap/ui-bootstrap-tpls.js',
      'bower_components/jquery/dist/jquery.js',
      'bower_components/kjua/dist/kjua.min.js',
      'bower_components/ngstorage/ngStorage.js',
      'node_modules/angular-mocks/angular-mocks.js',
      'js/settings.js',
      'js/supported-coins-list.js',
      'js/dev_tests.js',
      'js/lang/en.js',
      'js/iguana-add-coin-list.js',
      'js/app.js',
      'js/services/storage.js',
      'js/services/rates.js',
      'js/services/auth.js',
      'js/services/datetime.js',
      'js/services/syncStatus.js',
      'js/services/message.js',
      'js/services/passPhraseGenerator.js',
      'js/services/util.js',
      'js/services/api.js',
      'js/services/http.js',
      'js/services/error.js',
      'js/directives/modal.js',
      'js/directives/spinner.js',
      'js/directives/resize.js',
      'js/directives/timeAgo.js',
      'js/directives/numberOnly.js',
      'js/directives/scroll.js',
      'js/directives/appTitle.js',
      'js/filters/decimalPlacesFormat.js',
      'js/filters/lang.js',
      'js/controllers/loginController.js',
      'js/controllers/signupController.js',
      'js/controllers/dashboardController.js',
      'js/controllers/settingsController.js',
      'js/controllers/topMenuController.js',
      'js/controllers/selectCoinModalController.js',
      'js/controllers/addCoinLoginModalController.js',
      'js/controllers/receiveCoinModalController.js',
      'js/controllers/sendCoinModalController.js',
      'js/controllers/sendCoinPassphraseModalController.js',
      'js/controllers/flowModalController.js',
      'js/controllers/messageController.js',
      'partials/*.html',
      'spec/fixtures/*.json',
      'spec/dashboardController.spec.js'
    ]
  });
};
