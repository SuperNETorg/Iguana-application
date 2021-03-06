'use strict';

angular.module('IguanaGUIApp')
.service('$api', [
  'util',
  'md5',
  'http',
  '$state',
  '$timeout',
  '$interval',
  '$q',
  'vars',
  '$filter',
  '$storage',
  '$sessionStorage',
  '$syncStatus',
  '$message',
  '$passPhraseGenerator',
  function(util, md5, http, $state, $timeout, $interval, $q,
           vars, $filter, $storage, $sessionStorage, $syncStatus,
           $message, $passPhraseGenerator) {

    // bitcoin rpc error code ref: https://github.com/bitcoin/bitcoin/blob/62f2d769e45043c1f262ed45babb70fe237ad2bb/src/rpc/protocol.h#L30

    vars.$api = this;
    this.coinsInfo = {};
    this.isRT = false;
    $storage.isProxy = true;
    $storage.iguanaNullReturnCount = 0;

    this.testConnection = function() {
      var deferred = $q.defer(),
          setPortPollResponseDS = $storage['iguana-port-poll'],
          timeDiff = setPortPollResponseDS ?
            Math.floor(util.getTimeDiffBetweenNowAndDate(setPortPollResponseDS.updatedAt)) :
            0,
          index = 0;

      $syncStatus.getPortPollResponse(setPortPollResponseDS);

      for (var key in this.coinsInfo) {
        if (this.coinsInfo[key].connection === true) {
          index++;
        }
      }

      if (index === 0 && dev.showConsoleMessages && dev.isDev) {
        console.log('force port poll');
      }

      if (
        timeDiff >= util.portPollUpdateTimeout ||
        timeDiff === 0 ||
        index === 0
      ) {
        var defaultIguanaServerUrl = this.getConf().server.protocol +
                                     this.getConf().server.ip +
                                     ':' +
                                     this.getConf().server.iguanaPort,
            upass = this.Iguana_GetRPCAuth();

        http.get(defaultIguanaServerUrl + '/api/iguana/getconnectioncount', {
          cache: false,
          timeout: settings.defaultIguanaConnectionTimeOut,
          params: {
            userpass: upass ? upass : 'null'
          }
        })
        .then(
          function(response) {
            if (dev.isDev && dev.sessions) {
              for (var key in dev.sessions) {
                if (navigator.userAgent.indexOf(key) > -1) {
                  $storage.isIguana = dev.sessions[key];
                }
              }
            } else {
              if ($storage.guiModeAtLogin !== undefined) {
                $storage.isIguana = $storage.guiModeAtLogin;
              } else {
                $storage.isIguana = true;
              }

              if (dev.showConsoleMessages) {
                if (!$storage.isIguana) {
                  console.log('running non-iguana env');
                } else {
                  console.log('running iguana env');
                }
              }
            }

            if (!response.data.error || vars.first) {
              this.testCoinPorts()
                  .then(function(coins) {
                    deferred.resolve(coins);
                  });
            } else {
              deferred.reject(response);
              $interval.cancel(vars.dashboardUpdateRef);
            }
          }.bind(this),
          function(response) {
            // non-iguana env
            if (dev.isDev && dev.sessions) {
              for (var key in dev.sessions) {
                if (navigator.userAgent.indexOf(key) > -1) {
                  $storage.isIguana = dev.sessions[key];
                }
              }

              if (response.status === -1 && $storage.isIguana) {
                deferred.reject(-1);
              }
            } else {
              if ($storage.guiModeAtLogin !== undefined) {
                $storage.isIguana = $storage.guiModeAtLogin;
              } else {
                $storage.isIguana = false;
              }

              if (dev.showConsoleMessages) {
                if (!$storage.isIguana) {
                  console.log('running non-iguana env');
                } else {
                  console.log('running iguana env');
                }
              }
            }

            if (!$storage.isIguana) {
              this.testCoinPorts()
                  .then(function(coins) {
                    deferred.resolve(coins);
                  });
            } else {
              $interval.cancel(vars.dashboardUpdateRef);
              deferred.reject(response);
            }
          }.bind(this)
        );
      } else {
        if (dev.showConsoleMessages && dev.isDev)
          console.log('port poll done ' + timeDiff + ' s. ago');
        deferred.resolve(null);
      }

      return deferred.promise;
    };

    this.testCoinIsNotIguanaMode = function(response, index) {
      if (!$storage.isIguana) {
        this.coindCheckRT(index, function(coindCheckRTResponse) {
          var networkCurrentHeight = 0, //apiProto.prototype.getCoinCurrentHeight(index); temp disabled
              syncPercentage = (response.data.result.blocks * 100 / networkCurrentHeight).toFixed(2);

          if (dev.showConsoleMessages && dev.isDev) {
            console.log('Connections: ' + response.data.result.connections);
          }

          if (dev.showConsoleMessages && dev.isDev) {
            console.log(
              'Blocks: ' +
              response.data.result.blocks +
              '/' +
              networkCurrentHeight +
              ' (' +
              (syncPercentage !== 'Infinity' ? syncPercentage : 'N/A ') +
              '% synced)'
            );
          }

          if (
            response.data.result.blocks === networkCurrentHeight ||
            coindCheckRTResponse
          ) {
            this.isRT = true;
            this.coinsInfo[index].RT = true;
          } else {
            this.isRT = false;
            this.coinsInfo[index].RT = false;

            if (dev.showConsoleMessages && dev.isDev)
              console.log('RT is not ready yet!');
          }

          if (dev.isDev && dev.showSyncDebug) {
            var debugSyncInfo = angular.element(document).find('#debug-sync-info');

            if (debugSyncInfo.html().indexOf('coin: ' + index + ', ') < 0)
              debugSyncInfo.append(
                'coin: ' + index + ', ' +
                'con ' + response.data.result.connections + ', ' +
                'blocks ' + response.data.result.blocks + '/' + networkCurrentHeight +
                ' (' + (syncPercentage !== 'Infinity' ? syncPercentage : 'N/A ') + '% synced), ' +
                'RT: ' + (this.isRT ? 'yes' : 'no') + '<br/>'
              );
          }
        }.bind(this));
      }
    };

    this.testCoinIguanaMode = function(response, index) {
      if (response.status && $storage.isIguana) {
        if (
          response.status !== (null || -1) &&
          response.status instanceof 'string'
        ) {
          var iguanaGetInfo = response.status.split(' '),
              totalBundles = iguanaGetInfo[20].split(':'),
              currentHeight = iguanaGetInfo[9].replace('h.', ''),
              peers = iguanaGetInfo[16].split('/');

          this.coinsInfo[index].connection = true;

          // iguana
          if (response.status.indexOf('.RT0 ') > -1) {
            this.isRT = false;
            this.coinsInfo[index].RT = false;

            if (dev.showConsoleMessages && dev.isDev)
              console.log('RT is not ready yet!');
          } else {
            this.isRT = true;
            this.coinsInfo[index].RT = true;
          }

          // disable coin in iguna mode
          if (!iguanaAddCoinParams[index]) {
            this.coinsInfo[index].iguana = false;
          }

          if (dev.showConsoleMessages && dev.isDev) {
            console.log('Connections: ' + peers[0].replace('peers.', ''));
          }

          if (dev.showConsoleMessages && dev.isDev) {
            console.log('Blocks: ' + currentHeight);
          }

          if (dev.showConsoleMessages && dev.isDev) {
            console.log('Bundles: ' + iguanaGetInfo[14].replace('E.', '') + '/' +
              totalBundles[0] + ' (' + (iguanaGetInfo[14].replace('E.', '') * 100 / totalBundles[0]).toFixed(2) + '% synced)');
          }

          if (dev.isDev && dev.showSyncDebug) {
            var debugSyncInfo = angular.element(document).find('#debug-sync-info');

            if (debugSyncInfo.html().indexOf('coin: ' + index + ', ') < 0)
              debugSyncInfo.append(
                'coin: ' + index + ', ' +
                'con ' + peers[0].replace('peers.', '') + ', ' +
                'bundles: ' + iguanaGetInfo[14].replace('E.', '') + '/' +
                totalBundles[0] + ' (' + (iguanaGetInfo[14].replace('E.', '') * 100 / totalBundles[0]).toFixed(2) +
                '% synced), ' + 'RT: ' + (this.isRT ? 'yes' : 'no') + '<br/>'
              );
          }
        }
      }
    };

    this.checkLoopEnd = function(_index) {
      var debugSyncInfo = angular.element(document).find('#debug-sync-info');

      if (Object.keys(this.getConf().coins).length === _index) {
        if (dev.showConsoleMessages && dev.isDev) {
          console.log('port poll done ' + _index);
        }

        if (!$storage['isIguana']) {
          this.checkBackEndConnectionStatus();
        }

        if (dev.isDev && dev.showSyncDebug && debugSyncInfo.text()) {// debug info
          angular.element(document.body).css({ 'padding-bottom': debugSyncInfo.outerHeight() * 1.5 });
        }

        $interval(function() {
          var transactionUnit = angular.element(document.querySelector('.transactions-unit'));

          if (debugSyncInfo.text()) {
            if (transactionUnit) transactionUnit.css({ 'margin-bottom': debugSyncInfo.outerHeight() * 1.5 });
            angular.element(document.body).css({ 'padding-bottom': debugSyncInfo.outerHeight() * 1.5 });
          }
        }, 1000);

        vars.coinsInfo = this.coinsInfo;
      }
    };

    this.getCoins = function(coins, _index, coinsKeys) {
      var index = coinsKeys[_index],
          conf = coins[index],
          fullUrl = this.getFullApiRoute('getinfo', conf),
          postData = this.getBitcoinRPCPayloadObj('getinfo', null, index),
          postAuthHeaders = this.getBasicAuthHeaderObj(conf),
          deferred = $q.defer();

      http
        .post(fullUrl, postData, {
          cache: false,
          headers: postAuthHeaders
        })
        .then(
          function(response) {
            deferred.resolve([coins, response, ++_index, coinsKeys]);
          },
          function(response) {
            deferred.reject([coins, response, ++_index, coinsKeys]);
          }
        );

      return deferred.promise;
    };

    this.getInfo = function(coin) {
      var fullUrl = this.getFullApiRoute('getinfo', null, coin),
          postData = this.getBitcoinRPCPayloadObj('getinfo', null, coin),
          postAuthHeaders = this.getBasicAuthHeaderObj(null, coin, 'getinfo'),
          deferred = $q.defer();

      http.post(fullUrl, postData, {
        cache: false,
        headers: postAuthHeaders
      })
      .then(
        function(response) {
          deferred.resolve([response, coin]);
        },
        function(response) {
          deferred.reject([response, coin]);
        }
      );

      return deferred.promise;
    };

    this.testCoinPorts = function() {
      var _index = 0,
          coins = this.getConf().coins,
          debugSyncInfo = angular.element(document).find('#debug-sync-info'),
          self = this,
          deferred = $q.defer(),
          coinsKeys = Object.keys(coins);

      if (dev.isDev && dev.showSyncDebug) {
        debugSyncInfo.html(''); // TODO: change to angular broadcast
      }
      if (!$storage.isIguana) {
        self.getCoins(coins, _index, coinsKeys)
            .then(onResolve, onReject);
      } else {
        for (var i in coins) {
          if (!this.coinsInfo[i]) {
            this.coinsInfo[i] = {};
          }

          this.coinsInfo[i].connection = false;
          this.coinsInfo[i].RT = false;
          this.coinsInfo[i].iguana = iguanaAddCoinParams[i] ? true : false;
          this.coinsInfo[i].relayFee = iguanaMinFeeOverride[i];
        }

        this.checkLoopEnd(coinsKeys.length);
        deferred.resolve(self.coinsInfo);
      }

      function onResolve(attributes) {
        var coins = attributes[0],
            response = attributes[1],
            _index = attributes[2],
            coinsKeys = attributes[3],
            index = coinsKeys[_index - 1];

        if (!self.coinsInfo) {
          self.coinsInfo = {};
        }

        if (!self.coinsInfo[index]) {
          self.coinsInfo[index] = {};
        }

        if (dev.showConsoleMessages && dev.isDev) {
          console.log('p2p test ' + index);
        }

        if (dev.showConsoleMessages && dev.isDev) {
          console.log(response);
        }

        if (response.data && response.data.error === 'coin is busy processing') {
          self.coinsInfo[index].connection = true;
          self.coinsInfo[index].RT = false;
        }

        if (response.data && response.data.result && response.data.result.relayfee) {
          self.coinsInfo[index].relayFee = response.data.result.relayfee;
        }
        // TODO: add getinfo call
        /*if (response.data && response.data.result && response.data.result.txfee) {
          console.log(response.data.result);
          self.coinsInfo[index].relayFee = response.data.result.txfee;
        }*/
        if (
          response.data && response.data.result  && (
            response.data.result.walletversion ||
            response.data.result.difficulty ||
            response.data.result === 'success'
          )) {
          if (dev.showConsoleMessages && dev.isDev) {
            console.log('portp2p con test passed');
          }

          if (dev.showConsoleMessages && dev.isDev) {
            console.log(index + ' daemon is detected');
          }

          self.coinsInfo[index].connection = true;

          if (!$storage['connected-coins']) {
            $storage['connected-coins'] = {};
          }

          $storage['connected-coins'][index] = self.getConf().coins[index];

          self.testCoinIsNotIguanaMode(response, index);
        } else {
          self.testCoinIguanaMode(response, index);
        }
        if (coinsKeys.length === _index) {
          self.checkLoopEnd(_index);
          deferred.resolve(self.coinsInfo);
        } else if (coinsKeys.length > _index) {
          self.getCoins(coins, _index, coinsKeys)
              .then(onResolve, onReject);
        }
      }

      function onReject(attributes) {
        var coins = attributes[0],
            response = attributes[1],
            _index = attributes[2],
            coinsKeys = attributes[3],
            index = coinsKeys[_index - 1];

        if (!self.coinsInfo) {
          self.coinsInfo = {};
        }

        if (!self.coinsInfo[index]) {
          self.coinsInfo[index] = {};
        }

        if ($storage['connected-coins']) {
          delete $storage['connected-coins'][index];
        }

        if (response.statusText === 'error' && !$storage.isIguana) {
          $storage.isProxy = false;
        }

        if (response.data) {
          if (dev.showConsoleMessages && dev.isDev && response.data.error &&
            response.data.error.indexOf('Bad Gateway') === -1) {
            console.log('is proxy server running?');
          } else if (!response.status) {
            if (dev.showConsoleMessages && dev.isDev) {
              console.log('server is busy, check back later');
            }
          }

          if (response.data.error &&
            response.data.error.indexOf('Verifying blocks...') > -1) {
            if (dev.showConsoleMessages && dev.isDev) {
              console.log(index + ' is verifying blocks...');
            }
          }

          if (dev.showConsoleMessages && dev.isDev) {
            console.log('coind response: ', response.data);
          }
        }

        if ((response.status == -1 || response.status == 502) &&
              dev.isDev && dev.clearConsoleErrors) {
          console.clear();
        }

        if (coinsKeys.length == _index) {
          self.checkLoopEnd(_index);
          deferred.resolve(self.coinsInfo);
        } else if (coinsKeys.length > _index) {
          self.getCoins(coins, _index, coinsKeys)
              .then(onResolve, onReject);
        }
      }

      return deferred.promise;
    };

    this.checkBackEndConnectionStatus = function() {
      var totalCoinsRunning = 0,
          tempOutOfSync = angular.element(document).find('#temp-out-of-sync'),
          hiddenClassName = 'hidden';

      for (var key in this.coinsInfo) {
        if (this.coinsInfo[key].connection === true) totalCoinsRunning++;
      }

      /*if (totalCoinsRunning === 0 && $state.current.name !== 'login') {
        tempOutOfSync.html($filter('lang')('EXPERIMENTAL.SOMETHING_WENT_WRONG'));
        tempOutOfSync.removeClass('hidden');
      }
      if (totalCoinsRunning === 0) {
        $message.ngPrepMessageNoDaemonModal();
      }*/

      // out of sync message
      var outOfSyncCoinsList = '',
          coins = this.getConf().coins;

      for (var index in coins) {
        if ((
            this.coinsInfo[index].RT === false &&
            this.coinsInfo[index].connection === true &&
            $storage.isIguana && $storage['iguana-' + index + '-passphrase']
          ) ||
          (
            this.coinsInfo[index].RT === false &&
            !$storage.isIguana && $storage['iguana-' + index + '-passphrase'] &&
            $storage['iguana-' + index + '-passphrase'].logged === 'yes'
          )) {
            outOfSyncCoinsList += index.toUpperCase() + ', ';
        }
      }

      outOfSyncCoinsList = util.trimComma(outOfSyncCoinsList);

      if (!outOfSyncCoinsList.length) {
        tempOutOfSync.addClass(hiddenClassName);
      } else {
        tempOutOfSync.html(outOfSyncCoinsList + (outOfSyncCoinsList.indexOf(',') > -1 ? ' ' + $filter('lang')('EXPERIMENTAL.ARE') + ' ' : ' ' + $filter('lang')('EXPERIMENTAL.IS') + ' ') + $filter('lang')('EXPERIMENTAL.DASHBOARD_OUT_OF_SYNC_P3'));
        tempOutOfSync.removeClass(hiddenClassName);
      }
    };

    this.walletEncrypt = function(passphrase, coin) {
      var fullUrl = this.getFullApiRoute('encryptwallet', null, coin),
          postData = this.getBitcoinRPCPayloadObj('encryptwallet', '\"' + passphrase + '\"', coin),
          postAuthHeaders = this.getBasicAuthHeaderObj(null, coin, 'encryptwallet'),
          deferred = $q.defer();

      http
        .post(fullUrl, postData, {
          cache: false,
          headers: postAuthHeaders
        })
        .then(
          function(response) {
            if (dev.showConsoleMessages && dev.isDev) {
              console.log(response);
            }

            if (response.result) {
              // non-iguana
              if (_response.result) {
                deferred.resolve(response.result);
              } else {
                deferred.resolve(false);
              }
            } else {
              // iguana
              if (response.data.error) {
                // do something
                if (dev.showConsoleMessages && dev.isDev) {
                  console.log('error: ' + response.data.error);
                }

                deferred.resolve(response.data);
              } else {
                if (response.data.result === 'success') {
                  deferred.resolve(response.data);
                } else {
                  deferred.resolve(false);
                }
              }
            }
          }.bind(this),
          function(response) {
            if (response.data) {
              if (response.data.error.code) {
                deferred.reject(response.data.error.code);
                if (dev.showConsoleMessages && dev.isDev) {
                  console.log(response.statusText);
                }
              } else {
                if (dev.showConsoleMessages && dev.isDev) {
                  console.log(response);
                }
                deferred.reject(response.data);
              }
            } else {
              if (response.status === -1) {
                deferred.reject(response.status);
              }
            }
          }.bind(this)
        );

      return deferred.promise;
    };

    this.walletLock = function(coin) {
      var defer = $q.defer(),
          self = this,
          fullUrl = this.getFullApiRoute('walletlock', null, coin),
          postData = this.getBitcoinRPCPayloadObj('walletlock', null, coin),
          postAuthHeaders = this.getBasicAuthHeaderObj(null, coin, 'walletlock');

      http.post(fullUrl, postData, {
        cache: false,
        headers: postAuthHeaders
      }).then(onResolve, onReject);

      function onResolve(response) {
        if (response.data.result) {
          defer.resolve(response.data.result);
          // non-iguana
        } else {
          if (dev.showConsoleMessages && dev.isDev) {
            console.log(response);
          }

          if (response.data.error) {
            if (dev.showConsoleMessages && dev.isDev) {
              console.log('error: ' + response.data.error);
            }

            defer.reject(response);
          } else {
            defer.resolve(response);
          }
        }
      }

      function onReject(response) {
        defer.reject(response);
      }

      return defer.promise
    };

    this.walletLogin = function(passphrase, timeout, coin) {
      if (!$storage.isIguana) {
        timeout = settings.defaultWalletUnlockPeriod;
      }

      if (!timeout) {
        timeout = $storage.isIguana ?
          settings.defaultSessionLifetimeIguana :
          settings.defaultSessionLifetimeCoind;
      }

      var result = false,
          fullUrl = this.getFullApiRoute('walletpassphrase', null, coin),
          defaultIguanaServerUrl = this.getConf().server.protocol +
            this.getConf().server.ip +
            ':' +
            this.getConf().server.iguanaPort + '/api/bitcoinrpc/walletpassphrase',
          postData = this.getBitcoinRPCPayloadObj('walletpassphrase', '\"' +
            passphrase + '\", ' + timeout, coin),
          postAuthHeaders = this.getBasicAuthHeaderObj(null, coin, 'walletpassphrase'),
          deferred = $q.defer();

      http
        .post($storage.isIguana ? defaultIguanaServerUrl : fullUrl, postData, {
          headers: postAuthHeaders
        })
        .then(onResolve, onReject);

      function onResolve(response) {
        if (dev.showConsoleMessages && dev.isDev) {
          console.log(response.data.result);
        }

        deferred.resolve([response, coin]);
      }

      function onReject(response) {
        // TODO change response structure
        if (response.data) {
          if (response.data.error.message.indexOf('Error: Wallet is already unlocked, use walletlock first if need to change unlock settings.') > -1) {
            result = true;
          } else if (response.data.error.message.indexOf('Error: The wallet passphrase entered was incorrect') > -1 || response.data.error.message.indexOf('"code":-1') > -1) {
            result = -14;
          } else if (response.data.error.message.indexOf('Error: running with an unencrypted wallet, but walletpassphrase was called') > -1) {
            result = -15;
          }

          if (dev.showConsoleMessages && dev.isDev)
            console.log(response);
        } else {
          if (dev.showConsoleMessages && dev.isDev) {
            console.log(response);
          }
        }

        deferred.reject([result, coin]);
      }

      return deferred.promise
    };

    this.coindCheckRT = function(coin) {
      var result = false,
          fullUrl = this.getFullApiRoute('getblocktemplate', null, coin),
          postData = this.getBitcoinRPCPayloadObj('getblocktemplate'),
          postAuthHeaders = this.getBasicAuthHeaderObj(null, coin, 'getblocktemplate'),
          deferred = $q.defer();

      http
        .post(fullUrl, postData, {
          cache: false,
          headers: postAuthHeaders
        })
        .then(
          function(response) {
            if (response.data.result.bits) {
              result = true;
            } else {
              result = false;
            }

            deferred.resolve(result);
          },
          function(response) {
            if (dev.showConsoleMessages && dev.isDev) {
              console.log(response.data.responseText);
            }

            if (response.data && response.data.responseText && response.data.responseText.indexOf(
                ':-10') === -1) {
              result = true;
            } else {
              result = false;
            }

            deferred.resolve(result);

            //TODO: not tested
            /*deferred.reject(result);*/
          }
        );

      return deferred.promise;
    };

    this.getConf = function(discardCoinSpecificPort, coin) {
      var conf = {
        'server': {
          'protocol': 'http://',
          'ip': '127.0.0.1',
          'iguanaPort': settings.iguanaPort
        },
        'coins': supportedCoinsList
      };

      // coin port switch hook
      if (coin && conf.coins[coin].coindPort && !$storage.isIguana) {
        conf.server.port = conf.coins[coin].coindPort;

        return conf;
      }

      if (
        $storage.activeCoin &&
        $storage.activeCoin.length > 1 &&
        !discardCoinSpecificPort
      ) {
        conf.server.port = conf.coins[$storage.activeCoin].portp2p;

        if (!$storage.isIguana) {
          if (conf.coins[$storage.activeCoin].coindPort) {
            conf.server.port = conf.coins[$storage.activeCoin].coindPort;
          }
        }
      } else {
        conf.server.port = conf.server.iguanaPort;
      }

      if (coin && conf.coins && conf.coins[coin]) {
        conf.server.port = conf.coins[coin].portp2p;
      }

      return conf;
    };

    this.getAccountAddress = function(coin, account) {
      if (dev.coinAccountsDev && !$storage.isIguana) {
        if (dev.coinAccountsDev.coind[coin]) {
          account = dev.coinAccountsDev.coind[coin];
        }
      }

      var fullUrl = this.getFullApiRoute('getaccountaddress', null, coin),
          postData = this.getBitcoinRPCPayloadObj('getaccountaddress', '\"' + account + '\"', coin),
          postAuthHeaders = this.getBasicAuthHeaderObj(null, coin, 'getaccountaddress'),
          deferred = $q.defer();

      http
        .post(fullUrl, postData, {
          cache: false,
          headers: postAuthHeaders
        })
        .then(
          function(response) {
            if (dev.showConsoleMessages && dev.isDev)
              console.log(response);
            // iguana
            if (response.data.address) {
              deferred.resolve(response.data.address);
            } else {
              deferred.resolve(response.data.result); // non-iguana
            }
          },
          function(response) {
            deferred.reject(response);

            if (dev.showConsoleMessages && dev.isDev) {
              console.log(response);
            }
          }
        );

      return deferred.promise;
    };

    this.addCoinRecursive = function(coins, _index, recursiveResult) {
      var coin = coins[_index] || {},
          result = recursiveResult || [],
          postAuthHeaders = this.getBasicAuthHeaderObj(null, coin.coinId),
          fullUrl = this.getConf().server.protocol +
                    this.getConf().server.ip + ':' +
                    this.getConf(true).server.port,
          deferred = $q.defer();

      var params = JSON.parse(iguanaAddCoinParams[coin.coinId]);

      params.userpass = this.Iguana_GetRPCAuth();
      params.RELAY = coin.activeMode;
      params.VALIDATE = coin.activeMode;

      params = JSON.stringify(params);

      http.post(fullUrl, params, {
        headers: postAuthHeaders
      })
      .then(
        function(response) {
          if (dev.showConsoleMessages && dev.isDev) {
            console.log(response);
          }

          if (response.data.result === 'coin added' ||
            response.data.result === 'coin already there') {
            result.push([coin.coinId, response]);
          } else {
            result.push([coin.coinId, response]);
          }

          deferred.resolve([result, ++_index]);
        },
        function(response) {
          result.push([response, ++_index]);
          deferred.reject(result);
        }
      );

      return deferred.promise;
    };

    this.addCoins = function(coins, _index, result) {
      var self = this,
          coinsKeys = util.getCoinKeys(coins),
          coinsLength = coinsKeys.length,
          deferred = $q.defer();

      if (coins.length) {
        this.addCoinRecursive(coins, _index, result)
            .then(onResolve, onReject);
      } else {
        deferred.reject(false);
      }

      function onResolve(result) {
        if (coinsLength <= result[1]) {
          deferred.resolve(result[0]);
        } else {
          self.addCoinRecursive(coins, result[1], result[0])
              .then(onResolve, onReject);
        }
      }

      function onReject(data) {
        var response = data[0],
            coin = data[1];
        // do something
        if (dev.showConsoleMessages && dev.isDev) {
          console.log('error: ' + response.error);
        }

        deferred.reject([response, coin]);
      }

      return deferred.promise;
    };

    this.getIguanaRate = function(quote) { // deprecated, !DON'T REMOVE!
      var result = false,
          deferred = $q.defer(),
          quoteComponents = quote.split('/'),
          fullUrl = this.getServerUrl(true) +
          '/iguana/addcoin?base=' +
          quoteComponents[0] +
          '&rel=' +
          quoteComponents[1];

      http
        .get(fullUrl, '', {
          cache: false
        })
        .then(
          function(_response) {
            var response = JSON.parse(_response);

            if (response.result === 'success') {
              result = response.quote;
            } else {
              deferred.resolve(false);
            }
          },
          function(_response) {
            // do something
            if (dev.showConsoleMessages && dev.isDev) {
              console.log('error: ' + _response.error);
            }

            deferred.resolve(false);
          }
        );

      return deferred.promise;
    };

    this.getExternalRate = function(quote) {
      var result = false,
          quoteComponents = quote.split('/'),
          fullUrl = 'https://min-api.cryptocompare.com/data/pricemulti?fsyms=' + quoteComponents[0] + '&tsyms=' + quoteComponents[1],
          deferred = $q.defer();

      http.get(fullUrl, '', {
        cache: false
      })
      .then(
        function(response) {
          response = response.data;

          if (response && Object.keys(response).length) {
            result = response; //response[quoteComponents[1]];

            if (dev.showConsoleMessages && dev.isDev) {
              console.log(
                'rates source https://min-api.cryptocompare.com/data/pricemulti?fsyms=' + quoteComponents[0] + '&tsyms=' + quoteComponents[1]);
            }
          } else {
            result = false;
          }

          deferred.resolve([result, quoteComponents[0]]);
        },
        function() {
          console.log('falling back to ext service #2');

          http.get(
            'http://api.cryptocoincharts.info/tradingPair/btc_' + quoteComponents[1].toLowerCase(),
            '', { cache: false }
          )
          .then(function(response) {
            var response = response.data;

            if (response.price) {
              var btcToCurrency = response.price;

              // get btc -> altcoin rate
              http.get('https://poloniex.com/public?command=returnTicker', '', {
                cache: false
              })
              .then(function(response) {
                var response = response.data;

                if (response['BTC_' + quoteComponents[0].toUpperCase()]) {
                  result = btcToCurrency * response['BTC_' + quoteComponents[0].toUpperCase()].last;

                  if (dev.showConsoleMessages && dev.isDev) {
                    console.log('rates source http://api.cryptocoincharts.info and https://poloniex.com');
                  }
                } else {
                  result = false;
                }

                deferred.resolve([result, quoteComponents[0]]);
              }, function(response) {
                if (dev.showConsoleMessages && dev.isDev) {
                  console.log('both services are failed to respond');
                }
              });
            } else {
              deferred.resolve([false]);
            }
          }, function(response) {
            if (dev.showConsoleMessages && dev.isDev) {
              console.log('both services failed to respond');
            }
          })
        }
      );

      return deferred.promise;
    };

    this.getServerUrl = function(discardCoinSpecificPort) {
      return this.getConf().server.protocol +
        this.getConf().server.ip +
        ':' +
        this.getConf(discardCoinSpecificPort).server.port +
        '/api/';
    };

    this.getBasicAuthHeaderObj = function(conf, coin, method) {
      if (dev && dev.isNightwatch &&
          (method === 'settxfee' ||
          method === 'getaccountaddress' ||
          method === 'getbalance' ||
          method === 'settxfee' ||
          method === 'listtransactions' ||
          method === 'sendtoaddress')) { // wip, UAT
        if (conf) {
          return $storage.isIguana ?
                  {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + btoa(conf.user + ':' + conf.pass)
                  } :
                  { 'Authorization': 'Basic ' + btoa(conf.user + ':' + conf.pass) };
        } else if ($storage.activeCoin || coin) {
          return $storage.isIguana ?
                  {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + btoa(this.getConf().coins[coin ? coin : $storage.activeCoin].user + ':' +
                                      this.getConf().coins[coin ? coin : $storage.activeCoin].pass)
                  } :
                  {
                    'Authorization': 'Basic ' + btoa(this.getConf().coins[coin ? coin : $storage.activeCoin].user + ':' +
                                      this.getConf().coins[coin ? coin : $storage.activeCoin].pass)
                  };
        }
      } else {
        if (conf) {
          return $storage.isIguana ?
                  { 'Content-Type': 'application/x-www-form-urlencoded' } :
                  { 'Authorization': 'Basic ' + btoa(conf.user + ':' + conf.pass) };
        } else if ($storage.activeCoin || coin) {
          return $storage.isIguana ?
                  { 'Content-Type': 'application/x-www-form-urlencoded' } :
                  {
                    'Authorization': 'Basic ' + btoa(this.getConf().coins[coin ? coin : $storage.activeCoin].user + ':' +
                                      this.getConf().coins[coin ? coin : $storage.activeCoin].pass)
                  };
        }
      }

      return {};
    };

    this.getBitcoinRPCPayloadObj = function(method, params, coin) {
      var upass = this.Iguana_GetRPCAuth();

      if (dev && dev.isNightwatch) { // wip, UAT
        if ($storage.isIguana && method !== 'settxfee' &&
          method !== 'getaccountaddress' &&
          method !== 'getbalance' &&
          method !== 'settxfee' &&
          method !== 'listtransactions' &&
          method !== 'sendtoaddress') {
          return '{ ' + (coin ? ('\"coin\": \"' + coin.toUpperCase() + '\", ') : '') +
                    '\"method\": \"' + method + '\", \"immediate\": \"120000\", \"params\": [' +
                    (!params ? '' : params) + ']' + (upass ? ', \"userpass\": \"' + upass + '\" ' : '') + ' }';
        } else {
          return '{ \"agent\": \"bitcoinrpc\",' +
                    '\"method\": \"' + method + '\", \"timeout\": \"2000\", \"params\": [' + (!params ? '' : params) + '] }';
        }
      } else {
        if ($storage.isIguana) {
          return '{ ' + (coin ? ('\"coin\": \"' + coin.toUpperCase() + '\", ') : '') +
                    '\"method\": \"' + method + '\", \"immediate\": \"120000\", \"params\": [' +
                    (!params ? '' : params) + ']' + (upass ? ', \"userpass\": \"' + upass + '\" ' : '') + ' }';
        } else {
          return '{ \"agent\": \"bitcoinrpc\",' +
                    '\"method\": \"' + method + '\", \"timeout\": \"2000\", \"params\": [' + (!params ? '' : params) + '] }';
        }
      }
    };

    this.getFullApiRoute = function(method, conf, coin) {
      if (dev && dev.isNightwatch) { // wip, UAT
        var reroute = (
          method === 'settxfee' ||
          method === 'getaccountaddress' ||
          method === 'getbalance' ||
          method === 'listtransactions' ||
          method === 'sendtoaddress') ? settings.proxy : this.getConf().server.protocol;
        var reroutePort = (
          method === 'settxfee' ||
          method === 'getaccountaddress' ||
          method === 'getbalance' ||
          method === 'settxfee' ||
          method === 'listtransactions' ||
          method === 'sendtoaddress') ? this.getConf(false, coin).server.port : this.getConf(true).server.port + '/api/bitcoinrpc/' + method;

        if (coin === 'sys' && (
          method === 'settxfee' ||
          method === 'getaccountaddress' ||
          method === 'getbalance' ||
          method === 'settxfee' ||
          method === 'listtransactions' ||
          method === 'sendtoaddress')) {
            reroutePort = 8368;
        }

        if (conf) {
          var reroutePorfConf = (
            method === 'settxfee' ||
            method === 'getaccountaddress' ||
            method === 'getbalance' ||
            method === 'settxfee') ? (conf.coindPort ? conf.coindPort : conf.portp2p) : conf.portp2p;

          return $storage['isIguana'] ? (reroute +
                                         this.getConf().server.ip + ':' +
                                         reroutePorfConf + '/api/bitcoinrpc/' + method) : (settings.proxy +
                                         this.getConf().server.ip + ':' +
                                         (conf.coindPort ? conf.coindPort : conf.portp2p));
        } else {
          return $storage['isIguana'] ? (reroute +
                                         this.getConf().server.ip + ':' +
                                         reroutePort) : (settings.proxy +
                                         this.getConf().server.ip + ':' +
                                         this.getConf(false, coin).server.port);
        }
      } else {
        if (conf) {
          return $storage.isIguana ? (this.getConf().server.protocol +
                                      this.getConf().server.ip + ':' +
                                      conf.portp2p + '/api/bitcoinrpc/' + method) : (settings.proxy +
                                      this.getConf().server.ip + ':' +
                                      (conf.coindPort ? conf.coindPort : conf.portp2p));
        } else {
          return $storage.isIguana ? (this.getConf().server.protocol +
                                      this.getConf().server.ip + ':' +
                                      this.getConf(true).server.port + '/api/bitcoinrpc/' + method) : (settings.proxy +
                                      this.getConf().server.ip + ':' +
                                      this.getConf(false, coin).server.port);
        }
      }
    };

    // TODO: chain wallet unlock/lock and sendtoaddress
    this.sendToAddress = function(coin, sendInfo) {
      var result = false,
          deferred = $q.defer(),
          fullUrl = this.getFullApiRoute('sendtoaddress', null, coin),
          postData = this.getBitcoinRPCPayloadObj('sendtoaddress', '\"' + sendInfo.address + '\", ' + sendInfo.amount + ', \"' + sendInfo.note + '\"', coin),
          postAuthHeaders = this.getBasicAuthHeaderObj(null, coin, 'sendtoaddress');

      http.post(fullUrl, postData, {
        cache: false,
        headers: postAuthHeaders
      })
      .then(function(_response) {
        if (vars.error.status !== 10) {
          if (dev.showConsoleMessages && dev.isDev) {
            console.log(_response);
          }

          if (_response.data.result) {
            // non-iguana
            if (_response.data.result.length) {
              result = _response.data.result;
            } else {
              result = false;
            }
          } else {
            // iguana
            if (!_response.data.error) {
              var response = JSON.parse(_response);
            } else {
              response = _response;
            }

            if (response.data.error) {
              // do something
              if (dev.showConsoleMessages && dev.isDev) {
                console.log('error: ' + response.data.error);
              }

              result = false;
            } else {
              if (response.data.result.length) {
                result = response.data.result;
              } else {
                result = false;
              }
            }
          }
        }

        deferred.resolve(result);
      }.bind(this), function(response) {
        if (vars.error.status === -13) {
          result = false;

          if (dev.showConsoleMessages && dev.isDev) {
            console.log('unlock the wallet first');
          }
        }

        deferred.resolve(result);
      }.bind(this));

      return deferred.promise;
    };

    this.setTxFee = function(coin, fee) {
      var result = false,
          fullUrl = this.getFullApiRoute('settxfee', null, coin),
          postData = this.getBitcoinRPCPayloadObj('settxfee', '\"' + fee + '\"', coin),
          postAuthHeaders = this.getBasicAuthHeaderObj(null, coin, 'settxfee'),
          deferred = $q.defer();

      http.post(fullUrl,postData,{
        cache: false,
        headers: postAuthHeaders
      })
      .then(function(_response) {
        if (vars.error.status !== 10) {
          if (dev.showConsoleMessages && dev.isDev) {
            console.log(_response);
          }

          if (_response.data.result) {
            // non-iguana
            result = _response.data.result;

            /*if (_response.data.result.length) {
            } else {
              result = false;
            }*/
          } else {
            // iguana
            var response = JSON.parse(_response);

            if (response.error) {
              // do something
              if (dev.showConsoleMessages && dev.isDev) {
                console.log('error: ' + response.error);
              }

              result = false;
            } else {
              if (response.data.result.length) {
                result = response.data.result;
              } else {
                result = false;
              }
            }
          }
        }

        deferred.resolve(result);
      }.bind(this),
      function(response) {
        deferred.resolve(false);
      }.bind(this));

      return deferred.promise;
    };

    // temp deprecated
    // !DON'T DELETE!
    /*this.getCoinCurrentHeight = function(coin) {
      var result = false,
          deferred = $q.defer();

      if (this.getConf().coins[coin].currentBlockHeightExtSource !== 'disabled') {
        http.get(this.getConf().coins[coin].currentBlockHeightExtSource, '', {
          cache: false
        })
        .then(function(response) {
          if (response.blockcount || response.info || response.height || response.data || response[coin] || response.blocks) {
            if (response.blockcount) {
              result = response.blockcount;
            }
            if (response.info) {
              result = response.info.blocks;
            }
            if (response.height) {
              result = response.height;
            }
            if (response.blocks) {
              result = response.blocks;
            }
            if (response.data) {
              result = response.data.last_block.nb;
            }
            if (response[coin]) {
              result = response[coin].height;
            }

            deferred.resolve(result);
          } else {
            if (dev.showConsoleMessages && dev.isDev) console.log('error retrieving current block height from ' + this.getConf().coins[coin].currentBlockHeightExtSource);
            result = false;

            deferred.resolve(result);
          }
        })
      } else {
        result = 'NA';
      }

      deferred.resolve(result);

      return deferred.promise;
    };*/

    this.listTransactions = function(account, coin, update) {
      var result = false,
          deferred = $q.defer();

      // dev account lookup override
      if (dev.coinAccountsDev && !$storage.isIguana && !dev.isNightwatch) {
        if (dev.coinAccountsDev.coind[coin]) {
          account = dev.coinAccountsDev.coind[coin];
        }
      }

      if (dev.isNightwatch && $storage.isIguana) {
        account = '';
      }

      var fullUrl = this.getFullApiRoute('listtransactions', null, coin),
          postData = this.getBitcoinRPCPayloadObj('listtransactions', '\"' + account + '\", '
            + settings.defaultTransactionsCount, coin), // last N tx
          postAuthHeaders = this.getBasicAuthHeaderObj(null, coin, 'listtransactions');

      http.post(fullUrl, postData, {
        cache: false,
        headers: postAuthHeaders
      })
      .then(function(response) {
        if (vars.error.status !== 10) {
          if (dev.showConsoleMessages && dev.isDev) {
            console.log(response);
          }

          if (response.data.result) {
            // non-iguana
            if (response.data.result.length) {
              result = response.data.result;
            } else {
              result = false;
            }
          } else {
            // iguana
            if (response.data && response.data.error) {
              // do something
              if (dev.showConsoleMessages && dev.isDev) {
                console.log('error: ' + response.data.error);
              }

              result = false;
            } else {
              if (response.data.result.length) {
                result = response.data.result;
              } else {
                result = false;
              }
            }
          }
        }

        deferred.resolve(result, update);
      }.bind(this), function(response) {
        deferred.reject(result, update);
      }.bind(this));

      return deferred.promise;
    };

    this.getBalance = function(account, coin) {
      var result = false;

      // dev account lookup override
      if (dev.coinAccountsDev && !$storage.isIguana) {
        if (dev.coinAccountsDev.coind[coin]) {
          account = dev.coinAccountsDev.coind[coin];
        }
      }

      if (dev.isNightwatch && $storage.isIguana) {
        account = '';
      }

      var fullUrl = this.getFullApiRoute('getbalance', null, coin),
          // avoid using account names in bitcoindarkd
          postData = this.getBitcoinRPCPayloadObj('getbalance', coin === 'btcd' && !$storage.isIguana ? null : '\"' + account + '\"', coin),
          postAuthHeaders = this.getBasicAuthHeaderObj(null, coin, 'getbalance'),
          deferred = $q.defer();

      http.post(fullUrl, postData, {
        cache: false,
        dataType: 'json',
        headers: postAuthHeaders
      })
      .then(
        function(response) {
          if (vars.error.status !== 10) {
            if (response.data.result > -1 || Number(response) === 0) {
              // non-iguana
              result = response.data.result > -1 ? response.data.result : response;
            } else {
              if (dev.showConsoleMessages && dev.isDev) {
                console.log(response);
              }

              // iguana
              if (response.data && response.data.error) {
                // do something
                console.log('error: ' + response.data.error);
                result = response.data.error;
                deferred.reject([result, coin]);
              } else {
                if (response) {
                  result = response.data;
                } else {
                  result = false;
                }
              }
            }

            deferred.resolve([result, coin]);
          } else {
            if (
              response.data &&
              response.data.error === 'coin is busy processing'
            ) {
              if (!this.coinsInfo[coin]) {
                this.coinsInfo[coin] = {};
              }

              this.coinsInfo[coin].connection = true;
            }
          }
        }.bind(this),
        function(response) {
          if (response.data && typeof response.data === 'string') {
            if (
              response.data.indexOf('Accounting API is deprecated') > -1 ||
              response.data.indexOf('If you want to use accounting API')
            ) {
              if (dev.showConsoleMessages && dev.isDev && coin === 'btcd') {
                console.log('add enableaccounts=1 and staking=0 in btcd conf file');
              }
            }
          }

          deferred.reject(false, coin);
        }.bind(this)
      );

      return deferred.promise;
    };

    this.bitcoinFees = function() {
      return http.get('https://bitcoinfees.21.co/api/v1/fees/recommended');
    };

    this.bitcoinFeesAll = function() {
      return http.get('https://bitcoinfees.21.co/api/v1/fees/list');
    };

    this.feeCoins = function(activeCoin, defaultAccount, currencyName, coinName) {
      var deferred = $q.defer(),
          result = {};

      this
        .getBalance(defaultAccount, activeCoin)
        .then(
          function(response) {
            result.getBalance = response;
            this.bitcoinFees().then(function(bitcoinFees) {

              result.bitcoinFees = bitcoinFees;
              this.bitcoinFeesAll().then(function(responseAll) {

                result.bitcoinFeesAll = responseAll;
                this.getExternalRate(coinName + '/' + currencyName).then(function(currency) {

                  result.getExternalRate = currency;
                  deferred.resolve(result);
                }.bind(this));
              }.bind(this));
            }.bind(this));
          }.bind(this)
        );

      return deferred.promise;
    };

    this.Iguana_GenerateRPCAuth = function() {
      this.Iguana_SetRPCAuth(
        $passPhraseGenerator.generatePassPhrase(
          $storage.isIguana ?
          8 :
          4
        )
      );
    };

    this.Iguana_SetRPCAuth = function(RPCKey) {
      $storage.IguanaRPCAuth = md5.createHash(RPCKey);
    };

    this.Iguana_GetRPCAuth = function() {
      return $storage.IguanaRPCAuth;
    };

    this.getSelectedCoins = function() {
      var deferred = $q.defer(),
          defaultIguanaServerUrl = this.getConf().server.protocol +
                                   this.getConf().server.ip +
                                   ':' +
                                   this.getConf().server.iguanaPort,
          upass = this.Iguana_GetRPCAuth();

      http.get(defaultIguanaServerUrl + '/api/InstantDEX/allcoins', {
        cache: false,
        timeout: settings.defaultIguanaConnectionTimeOut,
        params: {
          userpass: upass ? upass : 'null'
        }
      }).then(deferred.resolve, deferred.reject);

      return deferred.promise;
    }
  }
]);