/*
 *  Iguana-GUI gulp build file
 *  Usage: gulp dev to build dev only verion
 *         gulp prod to build production version
 */

// dependencies
var gulp = require('gulp'),
    injectPartials = require('gulp-inject-partials'),
    rimraf = require('gulp-rimraf'),
    gutil = require('gulp-util'),
    sass = require('gulp-sass'),
    cleanCSS = require('gulp-clean-css'),
    concat = require('gulp-concat'),
    uglify = require('gulp-uglify'),
    replace = require('gulp-replace'),
    zip = require('gulp-zip'),
    es = require('event-stream'),
    fs = require('fs');

var paths = {
      partials: 'partials/**/*.html',
      styles: 'sass/**/*',
      js: 'js/**/*.js',
      fonts: 'fonts/**/*',
      build: {
        dev: 'compiled/dev',
        prod: 'compiled/prod'
      },
      configurable: {
        js: [
          'js/settings.js',
          'js/supported-coins-list.js'
        ]
      },
      omit: {
        prod: {
          js: [
            'js/dev.js'
          ]
        }
      }
    };

var buildMode;

function initJSIncludesArray() {
  var splitData,
      content = fs.readFileSync('jsIncludes.js', 'utf-8');

  splitData = content.split('</script>');
  splitData.pop();

  for (var i=0; i < splitData.length; i++) {
    if (splitData[i].indexOf(paths.configurable.js[0]) === -1 &&
        splitData[i].indexOf(paths.configurable.js[1]) === -1 &&
        splitData[i].indexOf(paths.omit[buildMode].js[0]) === -1) {
      splitData[i] = splitData[i].replace('\n<script type="text/javascript" src="', '')
                                 .replace(/<!--.*-->/, '')
                                 .replace('\n', '')
                                 .replace('">', '');
    } else {
      delete splitData[i];
    }
  }

  splitData.filter(function(item) {
    return item != undefined;
  }).join();

  return splitData;
}

function indexHTML() {
  return gulp.src('index.html')
             .pipe(replace('insertJS', buildMode === 'dev' ? 'jsIncludes.js' : 'jsIncludesProd.js'))
             .pipe(injectPartials({
               removeTags: buildMode === 'dev' ? false : true
             }))
             .pipe(gulp.dest(paths.build[buildMode]));
}

function copyJS() {
  if (buildMode === 'dev') {
    return gulp.src(paths.js)
               .pipe(gulp.dest(paths.build[buildMode] + '/js'));
  } else {
    var jsIncludesArray = initJSIncludesArray();

    return gulp.src(jsIncludesArray)
               .pipe(concat('all.js'))
               .pipe(uglify({ mangle: false }))
               .pipe(gulp.dest(paths.build[buildMode]));
  }
}

function copyProdConfigurableJS() {
  return gulp.src(paths.configurable.js)
             .pipe(gulp.dest(paths.build[buildMode] + '/js'));
}

function scss() {
  if (buildMode === 'dev') {
    return gulp.src('sass/style.scss')
               .pipe(sass().on('error', sass.logError))
               .pipe(gulp.dest(paths.build[buildMode]));
  } else {
    return gulp.src('sass/style.scss')
               .pipe(sass().on('error', sass.logError))
               .pipe(cleanCSS({ debug: true }, function(details) {
                  console.log(details.name + ' original size : ' + details.stats.originalSize);
                  console.log(details.name + ' minified size: ' + details.stats.minifiedSize);
                }))
               .pipe(gulp.dest(paths.build[buildMode]));

  }
}

function css() {
  if (buildMode === 'dev') {
    return gulp.src(paths.styles + '.css')
               .pipe(gulp.dest(paths.build[buildMode] + '/css'));
  } else {
    return gulp.src(paths.styles + '.css')
               .pipe(cleanCSS({ debug: true }, function(details) {
                 console.log(details.name + ' original size: ' + details.stats.originalSize);
                 console.log(details.name + ' minified size: ' + details.stats.minifiedSize);
               }))
               .pipe(gulp.dest(paths.build[buildMode] + '/css'));
  }
}

function compress() {
  return gulp.src(paths.build[buildMode] + '/**/*')
             .pipe(zip('latest.zip'))
             .pipe(gulp.dest(''));
}

function copyFonts() {
  return gulp.src(paths.fonts)
             .pipe(gulp.dest(paths.build[buildMode] + '/fonts'));
}

gulp.task('index', ['cleanIndex'], function() {
  indexHTML();
});

gulp.task('copyJS', ['cleanJS'], function() {
  copyJS();
});

gulp.task('scss', ['scss:css'], function() {
  scss();
});

gulp.task('scss:css', function() {
  css();
});

gulp.task('compress', function() {
  compress();
});

gulp.task('copyFonts', ['cleanFonts'], function() {
  copyFonts();
});

gulp.task('cleanCSS', function() {
  return gulp.src(paths.build[buildMode] + '/css/*', { read: false })
             .pipe(rimraf());
});

gulp.task('cleanJS', function() {
  return gulp.src(paths.build[buildMode] + '/js/*', { read: false })
             .pipe(rimraf());
});

gulp.task('cleanFonts', function() {
  return gulp.src(paths.build[buildMode] + '/fonts/*', { read: false })
             .pipe(rimraf());
});

gulp.task('cleanIndex', function() {
  return gulp.src(paths.build[buildMode] + '/index.html', { read: false })
             .pipe(rimraf());
});

gulp.task('cleanAllProd', function() {
  buildMode = 'prod';
  return gulp.src(paths.build[buildMode], { read: false })
             .pipe(rimraf());
});

gulp.task('default', function() {
  return gutil.log('Run gulp dev to build dev version or run gulp prod to build production version');
});

gulp.task('watch:dev', function() {
  gulp.watch(paths.partials, ['index']);
  gulp.watch(paths.js, ['copyJS']);
  gulp.watch(paths.styles, ['scss']);
});

gulp.task('dev', function() {
  buildMode = 'dev';
  gulp.start('cleanCSS', 'index', 'copyFonts', 'copyJS', 'scss', 'watch:dev');
});

gulp.task('prod', ['cleanAllProd'], function () {
  buildMode = 'prod';

  var _indexHTML = indexHTML(),
      _copyFonts = copyFonts(),
      _css = css(),
      _scss = scss(),
      _copyJS = copyJS(),
      _copyProdConfigurableJS = copyProdConfigurableJS();

  return es.merge(_indexHTML, _copyFonts, _copyJS, _copyProdConfigurableJS, _css, _scss);
});

gulp.task('zip', ['prod'], function() {
  compress();
});

gulp.task('clean:dev', function() {
  buildMode = 'dev';
  gulp.start('cleanAll');
});