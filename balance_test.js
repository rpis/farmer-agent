const { RPCAgent } = require("chia-agent");
const { get_blockchain_state } = require("chia-agent/api/rpc/full_node");
const { get_harvesters } = require("chia-agent/api/rpc/farmer");
const {get_wallet_balance} = require("chia-agent/api/rpc/wallet");
const fs = require("fs");
const https = require("https");
const { exit, config } = require("process");
var GLOBAL_CONFIG = require("./global-config.json");
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


function saveScan(farm_name, time){
  var farm = findFarmByName(farm_name);
  if (farm.monitoring == undefined)
    farm.monitoring = []
  farm.monitoring.push(time)
}

function getAndClearScan(farm_name){
  var farm = findFarmByName(farm_name);
  if (farm.monitoring == undefined)
    return {
      min: 0,
      max: 0,
      avg: 0,
      errors: 0,
      count:0
    };
  var min=99999;
  var max=0;
  var avg=0;
  var counter =0;
  var sum = 0;
  var errors =0;
  for (var scan_time of farm.monitoring)
  {
    if (scan_time<min) min = scan_time;
    if (scan_time>max) max = scan_time;
    if (scan_time> 5) errors++;
    sum = sum +  scan_time;
    counter++;
  }
  avg = sum / counter;
  farm.monitoring = [];

  return {
    min: min,
    max: max,
    avg: avg,
    errors: errors,
    count: counter
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
        farm.tail.farm_name = farm.farm_name
        farm.tail.on("line", function (data) {
        const mask = new RegExp(global_config.mask,"g");
          var ret = data.match(mask);
          if (ret != null) {
            try {
              saveScan(this.farm_name, Number(ret[0].replace(global_config.rm,'')));
            } catch (e){
              console.log("Internal conversion scan time error");
            }
          };
        });
      }
    }
  }
}

function processConfiguration(farms) {
  for (var farm of farms) {
    console.log("processing farm " + farm.farm_name);
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
    }
  }
  return farms;
}
(async () => {

  farms = processConfiguration(farms);
  initTails(farms);
  while (true) {
    farms.forEach(async (farm) => {
      var farm_state = {};
      farm_state.farmName = farm.farm_name;
      // get chia node status
      try {
        var agent = null;
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
        farm_state.state =
          response.blockchain_state.sync.synced == true ? 30 : 20;
        farm_state.fullNodeState =
          response.blockchain_state.sync.synced == true ? 30 : 20;
        farm_state.syncProgressHeight =
          response.blockchain_state.sync.sync_progress_height;
        farm_state.syncTipHeight =
          response.blockchain_state.sync.sync_tip_height;
        farm_state.space = response.blockchain_state.space;
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
            port: 9256,
            ca_cert: fs.readFileSync(farm.ca_cert),
            client_cert: fs.readFileSync(farm.farmer_client_cert),
            client_key: fs.readFileSync(farm.farmer_client_key),
          });

        const response = await get_wallet_balance(agent, {
          wallet_id
        });
        console.log(response);

      } catch (e) {
        console.log("farmer error");
        console.log(e);
        console.log("Not available connection to farmer");
        farm_state.farmerState = 10;
        farm_state.plots = 0;
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
    });
    await sleep(60000);
  }
})();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
