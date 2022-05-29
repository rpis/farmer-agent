const { RPCAgent } = require("chia-agent");
const { get_blockchain_state } = require("chia-agent/api/rpc/full_node");
const { get_harvesters } = require("chia-agent/api/rpc/farmer");
const { get_wallet_balance } = require("chia-agent/api/rpc/wallet");
const fs = require("fs");
const https = require("https");
const { exit, config } = require("process");
var GLOBAL_CONFIG = require("./global-config.json");
var checkInterval = 60000;
Tail = require("tail").Tail;

if (process.argv.length < 3) {
  console.log("Pass config file path as parameter");
  console.log("ex. node agent.js config.json");
  exit();
}
console.log("Config file :" + process.argv[2]);
var CONFIG = require(process.argv[2]);
var farms = CONFIG.farms;

function findConfigurationByType(type) {
  for (var config of GLOBAL_CONFIG) {
    if (config.type == type) return config;
  }
  return null;
}

function findFarmByName(name) {
  for (var farm of farms) {
    if (farm.farm_name == name) return farm;
  }
  return null;
}

function findFarmByNameRemoteConfig(remote_config, name) {
  for (var farm of remote_config) {
    if (farm.farmName == name) return farm;
  }
  return null;
}

function saveScan(farm_name, time) {
  var farm = findFarmByName(farm_name);
  if (farm.monitoring == undefined) farm.monitoring = [];
  farm.monitoring.push(time);
}

function getAndClearScan(farm_name) {
  var farm = findFarmByName(farm_name);
  if (farm.monitoring == undefined)
    return {
      min: 0,
      max: 0,
      avg: 0,
      errors: 0,
      count: 0,
    };
  var min = 99999;
  var max = 0;
  var avg = 0;
  var counter = 0;
  var sum = 0;
  var errors = 0;
  for (var scan_time of farm.monitoring) {
    if (scan_time < min) min = scan_time;
    if (scan_time > max) max = scan_time;
    if (scan_time > 5) errors++;
    sum = sum + scan_time;
    counter++;
  }
  if (counter != 0) {
    avg = sum / counter;
  } else {
    avg = 0;
    min = 0;
    max = 0;
  }
  farm.monitoring = [];

  return {
    min: min,
    max: max,
    avg: avg,
    errors: errors,
    count: counter,
  };
}

function initTails(farms) {
  for (var farm of farms) {
    if (farm.type != undefined && farm.home_dir != undefined) {
      farm.home_dir =
        farm.home_dir.endsWith("/") || farm.home_dir.endsWith("\\")
          ? farm.home_dir.slice(0, -1)
          : farm.home_dir;
      global_config = findConfigurationByType(farm.type);
      if (farm.monitor_scan_time) {
        farm.tail = new Tail(farm.home_dir + global_config.log_file);
        farm.tail.farm_name = farm.farm_name;
        farm.tail.on("line", function (data) {
          const mask = new RegExp(global_config.mask, "g");
          var ret = data.match(mask);
          if (ret != null) {
            try {
              saveScan(
                this.farm_name,
                Number(ret[0].replace(global_config.rm, ""))
              );
            } catch (e) {
              console.log("Internal conversion scan time error");
            }
          }
        });
      }
    }
  }
}

function callService(options) {
  return new Promise((resolve, reject) => {
    let req = https.request(options, (res) => {
      let output = "";
      res.setEncoding("utf8");

      res.on("data", function (chunk) {
        output += chunk;
      });

      res.on("end", () => {
        try {
          let obj = JSON.parse(output);
          resolve(obj);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.end();
  });
}

async function processConfiguration(farms) {
  //get farm configuration from server
  const options = {
    host: CONFIG.host,
    path: "/v1/farm/configuration",
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": 0,
      authorization: "ApiKey " + CONFIG.apiKey,
    },
  };
  var remote_config = [];
  try {
    remote_config = await callService(options);
  } catch (e) {
    console.log("Configuration connection error + " + e);
    exit(1);
  }
  // if farms definition not exists build from remote
  if (farms == undefined || farms.length == 0) {
    for (var remote of remote_config) {
      if (farms == undefined) farms = [];
      if (remote.coinType == undefined) continue;
      farms.push({
        farm_name: remote.farmName,
        type: remote.coinType,
        home_dir: CONFIG.home_dir,
        monitor_scan_time: remote.scanTimeMonitoring,
        monitor_balance: remote.balanceMonitoring,
        monitor_node: remote.nodeMonitoring,
        monitor_farmer: remote.farmerMonitoring,
      });
    }
  }
  for (var farm of farms) {
    console.log("processing farm " + farm.farm_name);
    var remote = findFarmByNameRemoteConfig(remote_config, farm.farm_name);

    if (remote != null) {
      checkInterval = remote.checkInterval * 1000;
      console.log("Found remote configuration");
      if (farm.type == undefined) farm.type = remote.coinType;
      if (farm.home_dir == undefined) farm.home_dir = CONFIG.home_dir;
      if (farm.monitor_scan_time == undefined)
        farm.monitor_scan_time = remote.scanTimeMonitoring;
      if (farm.monitor_balance == undefined)
        farm.monitor_balance = remote.balanceMonitoring;
      if (farm.monitor_node == undefined)
        farm.monitor_node = remote.nodeMonitoring;
      if (farm.monitor_farmer == undefined)
        farm.monitor_farmer = remote.farmerMonitoring;
    } else {
      console.log("Remote configuration not found");
    }
    if (farm.type != undefined && farm.home_dir != undefined) {
      farm.home_dir =
        farm.home_dir.endsWith("/") || farm.home_dir.endsWith("\\")
          ? farm.home_dir.slice(0, -1)
          : farm.home_dir;
      global_config = findConfigurationByType(farm.type);
      if (global_config == null) {
        console.log("Unknown farm type " + farm.type);
        exit(0);
      }
      if (farm.protocol == undefined) farm.protocol = global_config.protocol;
      if (farm.host == undefined) farm.host = global_config.host;
      if (farm.ca_cert == undefined)
        farm.ca_cert = farm.home_dir + global_config.ca_cert;
      if (farm.full_node_port == undefined)
        farm.full_node_port = global_config.full_node_port;
      if (farm.full_node_client_cert == undefined)
        farm.full_node_client_cert =
          farm.home_dir + global_config.full_node_client_cert;
      if (farm.full_node_client_key == undefined)
        farm.full_node_client_key =
          farm.home_dir + global_config.full_node_client_key;
      if (farm.farmer_port == undefined)
        farm.farmer_port = global_config.farmer_port;
      if (farm.farmer_client_cert == undefined)
        farm.farmer_client_cert =
          farm.home_dir + global_config.farmer_client_cert;
      if (farm.farmer_client_key == undefined)
        farm.farmer_client_key =
          farm.home_dir + global_config.farmer_client_key;
      if (farm.wallet_port == undefined)
        farm.wallet_port = global_config.wallet_port;
    }
    console.log(farm);
  }
  return farms;
}
(async () => {
  farms = await processConfiguration(farms);
  console.log("End config");
  initTails(farms);
  while (true) {
    farms.forEach(async (farm) => {
      var farm_state = {};
      farm_state.farmName = farm.farm_name;
      // get chia node status
      try {
        var agent = null;
        var error = false;
        if (farm.configPath != undefined)
          agent = new RPCAgent({
            service: "full_node",
            configPath: farm.configPath,
          });
        else
          agent = new RPCAgent({
            service: "full_node",
            protocol: farm.protocol,
            host: farm.host,
            port: farm.full_node_port,
            ca_cert: fs.readFileSync(farm.ca_cert),
            client_cert: fs.readFileSync(farm.full_node_client_cert),
            client_key: fs.readFileSync(farm.full_node_client_key),
          });
        const response = await get_blockchain_state(agent);
        error = response.status;
        if (response.status == true {
        farm_state.state =
          response.blockchain_state.sync.synced == true ? 30 : 20;
        farm_state.fullNodeState =
          response.blockchain_state.sync.synced == true ? 30 : 20;
        farm_state.syncProgressHeight =
          response.blockchain_state.sync.sync_progress_height;
        farm_state.syncTipHeight =
          response.blockchain_state.sync.sync_tip_height;
        farm_state.space = response.blockchain_state.space;
        }
      } catch (e) {
        console.log("farmer error");
        console.log(e);
        console.log("Not available connection to node");
        farm_state.state = 10;
        farm_state.fullNodeState = 10;
        farm_state.syncProgressHeight = 0;
        farm_state.syncTipHeight = 0;
        farm_state.space = 0;
      }
      if (!error)
      try {
        var agent = null;
        if (farm.configPath != undefined)
          agent = new RPCAgent({
            service: "farmer",
            configPath: farm.configPath,
          });
        else
          agent = new RPCAgent({
            service: "farmer",
            protocol: farm.protocol,
            host: farm.host,
            port: farm.farmer_port,
            ca_cert: fs.readFileSync(farm.ca_cert),
            client_cert: fs.readFileSync(farm.farmer_client_cert),
            client_key: fs.readFileSync(farm.farmer_client_key),
          });

        const response = await get_harvesters(agent);
        var plots = 0;
        response.harvesters.forEach((harverster) => {
          plots += harverster.plots.length;
        });
        farm_state.farmerState = 30;
        farm_state.plots = plots;
      } catch (e) {
        console.log("farmer error");
        console.log(e);
        console.log("Not available connection to farmer");
        farm_state.farmerState = 10;
        farm_state.plots = 0;
      }
      if (farm.monitor_balance != undefined && farm.monitor_balance)
        try {
          var agent = null;
          if (farm.configPath != undefined)
            agent = new RPCAgent({
              service: "wallet",
              configPath: farm.configPath,
            });
          else
            agent = new RPCAgent({
              service: "wallet",
              protocol: farm.protocol,
              host: farm.host,
              port: farm.wallet_port,
              ca_cert: fs.readFileSync(farm.ca_cert),
              client_cert: fs.readFileSync(farm.farmer_client_cert),
              client_key: fs.readFileSync(farm.farmer_client_key),
            });

          const response = await get_wallet_balance(agent, {
            wallet_id: 1,
          });
          console.log(response);
          if (response.success == true)
            farm_state.confirmedWalletBalance =
              response.wallet_balance.confirmed_wallet_balance;
        } catch (e) {
          console.log("Wallet error");
          console.log(e);
          console.log("Not available connection to wallet");
        }
      //scans
      var scan_times = getAndClearScan(farm.farm_name);
      farm_state.checkMin = scan_times.min;
      farm_state.checkMax = scan_times.max;
      farm_state.checkAvg = scan_times.avg;
      farm_state.checkErrors = scan_times.errors;
      farm_state.checkCount = scan_times.count;
      //service call
      const data = JSON.stringify(farm_state);

      const options = {
        hostname: CONFIG.host,
        path: "/v1/farm/status",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
          authorization: "ApiKey " + CONFIG.apiKey,
        },
      };
      try {
        const req = https.request(options, (res) => {
          if (res.statusCode == 401) {
            console.log(
              "Not allowed access. Check your ApiKey in configurattion!"
            );
          } else if (res.statusCode != 200) {
            console.log("Not defined farm_name. Check it!");
          }
        });

        req.on("error", (error) => {
          console.error(error);
        });

        req.write(data);
        req.end();
      } catch (e) {
        console.log("Agent connection error + " + e);
      }
      console.log(farm_state);
    }
    });
    await sleep(checkInterval);
  }
})();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
