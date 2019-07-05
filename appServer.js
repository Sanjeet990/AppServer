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
	// Query database by iterating over
	let promises = [];

	devices.forEach(device => {
		promises.push(new Promise(async function(resolve, reject) {
			var subDevices = listSubDevices(device, dbo);
			subDevices.then(function(data){
				resolve(data);
			}, function(error){
				reject(error);
			});
    	}))
	});	
	return Promise.all(promises);
}

function listSubDevices(device, dbo){
	return new Promise(function(resolve, reject) {
		// Query database by iterating over
		var query = { _id: device };
		dbo.collection("devices").find(query).toArray(function(err, result) {
			result.forEach(subDevice => {
				if (err){
					reject(err);
				}else{
					resolve(subDevice);
				}
			});
		})
    })
}

function prepareDeviceData(userEmail){
	return new Promise(function(resolve, reject) {
		var promiseMongo = initDBConnection();

		promiseMongo.then(function(dbo){
			//console.log("Connected to mongo database. " + dbo.domain);
			findDevices(userEmail, dbo).then(function(devicex){
				const subDevices = [];
				findSubDevices(devicex, dbo).then(function(subDevice){
					//console.log(JSON.stringify(subDevice, null, 4));
					resolve(subDevice);
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
		res.send("error");
	}
})
 
app.get('/exists', async function (req, res) {
	try{
		//const userEmail = await getEmail(req.headers);
		const userEmail = "sanjeet.pathak991@gmail.com";
		var deviceId = req.query.deviceId;

		var promiseMongo = initDBConnection();

		promiseMongo.then(function(dbo){
			dbo.collection("users").find({"devices":{$all :[deviceId]}}).toArray(function(err, result) {
				if(err){
					res.send("error");
				}else{
					if(result[0] == undefined || result[0] == null) res.send("okay");
					else if(result[0]._id == userEmail) res.send("duplicate");
					else res.send("exists:" + result[0]._id);
				}
				//console.log(JSON.stringify(result, null, 4));
			})
		}, function(error){
			res.send("error");
		})
		//res.send("okay");
	}catch(e){
		res.send("error" + e);
	}
})
 
app.listen(3001, () => console.log(`Example app listening.!`))
