# farmer-agent

# configuration file
Make own configuration file copying agent-config.json to config.json

Edit it. 

```
{
    "host": "farmer-agent.xiteo.usermd.net",
    "apiKey": "",
    "farms":[
        {
            "farm_name" : "farm1",
            "protocol": "https",
            "host": "localhost",
            "ca_cert":"/Users/rafal/.chia/mainnet/config/ssl/ca/chia_ca.crt",
            "full_node_port": 8555,
            "full_node_client_cert":"/Users/rafal/.chia/mainnet/config/ssl/full_node/private_full_node.crt",
            "full_node_client_key":"/Users/rafal/.chia/mainnet/config/ssl/full_node/private_full_node.key",
            "farmer_port": 8559,
            "farmer_client_cert":"/Users/rafal/.chia/mainnet/config/ssl/farmer/private_farmer.crt",
            "farmer_client_key":"/Users/rafal/.chia/mainnet/config/ssl/farmer/private_farmer.key"
        },
        {
            "farm_name" : "farm2",
            "configPath": "/Users/rafal/.chia/mainnet/config/config.yaml"
        }
    ]
}
```

* host - address of Farmer Wallet Agent Service
* apiKey - key  generated in mobile application
* farms - definitions of your farm  (one or more) to monitoring

* farm_name - name ofg your farm defined in application
* protocol - usually https
* host - allowed localhost with locally accessible certs files
* ca_cert - path to fork ca_certs (defined in FORK_HOME/mainnet/config.ssl/ca/FORK_NAME_ca.crt)
* full_node_port  - rpc port of full_node (you can find it in configuration file)
* full_node_client_cert/full_node_klient_key - certificate and key in  full_node path
* farmer_port - rpc port of farmner (you can find it in configuration file)
* farmer_client_cert/farmer_client_key - certificate and key in farmer path

# instalation and program run
git clone + copied repository address
cd farmer-agent
npm install

run:
node agent.js ./config.json

or by using  forever service:
npm install forever -g

forever agent.js ./config.json
