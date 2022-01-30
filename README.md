# farmer-agent

# configuration file
Make own configuration file copying agent-config.json to config.json

Edit it. 

Simple configuration based on global-config.json

```

{
    "host": "farmer-agent.xiteo.usermd.net",
    "apiKey": "",
    "farms":[
        {
            "farm_name" : "farm1",
            "type" : "xch",
            "home_dir" : "/coin_home/",
            "monitor_scan_time": true
            "farmer_port": 8559, // optional - default from global-config.json
            "full_node_port": 8555, //optional - default from global-config.json
        }
    ]
}

```


* host - address of Farmer Wallet Agent Service
* apiKey - key  generated in mobile application
* farms - definitions of your farm  (one or more) to monitoring

* farm_name - name of your farm defined in application
* type - type of farm (ex. xch for chia, sit for silicoin - find more in global-config.js)
* home_dir - directory with coin home dir (.chia, .sit,..)
* monitor_scan_time - set to true of you need to monitor scan latency reported in log file (remember to set log_level to INFO in configuration file, for chia its ./chia/mainnet/config/config.yaml)

```

  logging: &id001
    log_filename: log/debug.log
    log_level: INFO
    log_maxfilesrotation: 2
    log_stdout: false
    log_syslog: false
    log_syslog_host: 127.0.0.1
    log_syslog_port: 514

```    
* full_node_port  - optional rpc port of full_node (you can find it in configuration file)
* farmer_port - optional rpc port of farmner (you can find it in configuration file)


# Instalation and program run
* git clone + copied repository address
* cd farmer-agent
* npm install
* copy configuration example, set name config.json and edit this file

run:
node agent.js ./config.json

or by using  forever service:
npm install forever -g

forever agent.js ./config.json
