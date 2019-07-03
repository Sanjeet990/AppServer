const express = require('express');
const bodyParser = require('body-parser');
var Promise = require('promise');

var MongoClient = require('mongodb').MongoClient;

var url = "mongodb://marswavehome.tk:27017/smarthome";

const {AuthenticationClient} = require('auth0');
const auth0 = new AuthenticationClient({
  'clientId': 'v12WpZgnb7rdCH8opzT0I03Zirux4Lm2',
  'domain': 'marswave.auth0.com'
});

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

const getEmail = async (headers) => {
	try{
		const accessToken = headers.authorization.substr(7);
		const {email} = await auth0.getProfile(accessToken);
		return email;
	}catch(e){
		return null;
	}
}

function initDBConnection(){
	return new Promise(function(resolve, reject) {
		// Connect to database
		MongoClient.connect(url, { useNewUrlParser: true }, function(err, db) {
			if (err) {
                reject(err);
            } else {
				var dbo = db.db("smarthome");
                resolve(dbo);
            }
		})
    })
}

function findDevices(userEmail, dbo){
	return new Promise(function(resolve, reject) {
		// Query database
		var query = { _id: userEmail };
		dbo.collection("users").find(query).toArray(function(err, result) {
			if (err){
				reject(err);
			}else{
				var filtered = result[0].devices.filter(function (el) {
					return el != null;
				});
				resolve(filtered);
			}
		})
    })
}

function findSubDevices(devices, dbo){
	return new Promise(function(resolve, reject) {
		// Query database by iterating over
		var subDevices = [];
		devices.forEach(device => {
			var query = { _id: device };
			dbo.collection("devices").find(query).toArray(function(err, result) {
				result.forEach(subDevice => {
					if (err){
						reject(err);
					}else{
						var filtered = result[0].subDevices.filter(function (el) {
							return el != null;
						});
						resolve(filtered);
					}
				});
			})
		});
    })
}

function prepareDeviceData(userEmail){
	return new Promise(function(resolve, reject) {
		const devices = [];
		
		var promiseMongo = initDBConnection();

		promiseMongo.then(function(dbo){
			//console.log("Connected to mongo database. " + dbo.domain);
			findDevices(userEmail, dbo).then(function(devicex){
				findSubDevices(devicex, dbo).then(function(subDevice){
					subDevice.forEach(data => {	
						const deviceData = {
							"id": data.id,
							"type": data.type,
							"traits": [data.traits],
							"name": {
								"defaultNames": [data.defaultNames],
								"name": data.name,
								"nicknames": [data.nicknames]
							},
							"willReportState": false,
							"deviceInfo": {
								"manufacturer": "Marswave SmartHome",
								"model": data.model,
								"hwVersion": data.hwVersion,
								"swVersion": data.swVersion
							}
						};
						devices.push(deviceData);
					});
					resolve(devices);
				}, function(error){
					reject("Error: " + error);
				})
			}, function(error){
				reject("Error: " + error);
			})
		}, function(error){
			reject("Can not connect to database.");
		})	
	})
}

const app = express();

app.get('/', async function (req, res) {
	try{
		const userEmail = await getEmail(req.headers);
		//const userEmail = "sanjeet.pathak990@gmail.com";
		if(userEmail != undefined && userEmail != null && userEmail != ""){
			//console.log(userEmail);
			var devices = await prepareDeviceData(userEmail);
			var data = {
				payload: {
					agentUserId: userEmail,
					devices
				}
			};
			res.send(data);
		}else{
			res.send("Invalid token supplied.");
		}
	}catch(e){
		res.send("Error occurred!");
	}
})
 
app.listen(3001, () => console.log(`Example app listening.!`))
