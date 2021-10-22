const { RPCAgent } = require("chia-agent");
const { get_blockchain_state } = require("chia-agent/api/rpc/full_node");
const { get_harvesters } = require("chia-agent/api/rpc/farmer");
//const si = require("systeminformation");
const fs = require("fs");
const https = require('https');

const { exit } = require("process");

if (process.argv.length<3){
  console.log("Pass config file path as parameter");
  console.log("ex. node agent.js config.json");
  exit();
}
console.log("Config file :"+process.argv[2]);
var CONFIG = require(process.argv[2]);



const winston = require("winston");
const consoleTransport = new winston.transports.Console({
  level: "error",
});
const myWinstonOptions = {
  transports: [consoleTransport],
};
const logger = new winston.createLogger(myWinstonOptions);

(async () => {
  var farms = CONFIG.farms;
  while (true){
  farms.forEach(async (farm) => {
    var farm_state = {};
    farm_state.farm_name = farm.farm_name;
    //console.log(farm);
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
      //console.log(response);
      farm_state.state = response.blockchain_state.sync.synced == true ? 30 : 20;
      farm_state.full_node_state = response.blockchain_state.sync.synced == true ? 30 : 20;
      farm_state.sync_progress_height = response.blockchain_state.sync.sync_progress_height;
      farm_state.sync_tip_height = response.blockchain_state.sync.sync_tip_height;
      farm_state.space = response.blockchain_state.space;
      //console.log("synced: " + response.blockchain_state.sync.synced);
    } catch (e) {
      console.log("farmer error");
      console.log(e);
      //if (e.code == "ECONNREFUSED") {
        console.log("Not available connection to node");
        farm_state.state = 10;
        farm_state.full_node_state = 10;
        farm_state.sync_progress_height = 0;
        farm_state.sync_tip_height = 0;
        farm_state.space = 0;
      //} else {
      //  process.exit();
      //}
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
      //console.log(response);
      response.harvesters.forEach((harverster) => {
        plots += harverster.plots.length;
      });
      //console.log(plots);
      farm_state.farmer_state = 30;
      farm_state.plots = plots;
    } catch (e) {
      console.log("farmer error");
      console.log(e);
      //if (e.code == "ECONNREFUSED") {
        console.log("Not available connection to farmer");
        farm_state.farmer_state = 10;
        farm_state.plots = 0;
      //} else {
      //  process.exit();
      //}
    }

    /*var host = {};
    var hdds = [];
    (await si.diskLayout()).forEach((v) => {
      console.log(v);
      hdds.push({
        name: v.name,
        temperature: v.temperature,
      });
    });
    host.hdds = hdds;
    const cpu = await si.currentLoad();
    var cpu_load = 0;
    cpu.cpus.forEach((cpu) => {
      cpu_load += cpu.load;
    });
    cpu_load = cpu_load / cpu.cpus.length;
    host.cpu_load = cpu_load;
    //await new Promise(r => setTimeout(r, 2000));
    //console.log("load = "+ cpu_load);

    const osInfo = await si.osInfo();
    host.os = osInfo.platform;
    host.distro = osInfo.distro;
    //console.log((await si.osInfo()))

    farm_state.host = host;
*/
    //wywolanie uslugi
    const data = JSON.stringify(farm_state)

    
    const options = {
      hostname: CONFIG.host,
      path: '/farm/status',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'authorization' : 'ApiKey '+CONFIG.apiKey,

      }
    }

    const req = https.request(options, res => {
      if (res.statusCode==401){
        console.log("Not allowed access. Check your ApiKey in configurattion!")
      } else
      if (res.statusCode!=200){
        console.log("Not defined farm_name. Check it!")
      }
    })
    
    req.on('error', error => {
      console.error(error)
    })
    
    req.write(data)
    req.end()
    
    console.log(farm_state);
  });
  await sleep(60000)
}

})();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}