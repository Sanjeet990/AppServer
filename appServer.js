const express = require('express');
const bodyParser = require('body-parser');
var Promise = require('promise');

var MongoClient = require('mongodb').MongoClient;

var url = "mongodb://marswavehome.tk:27017/smarthome";

var port = process.env.PORT || 3001;

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
		var filtered = [];
		dbo.collection("users").find(query).toArray(function(err, result) {
			if (err){
				reject(err);
			}else{
				if(result.length > 0){
					filtered = result[0].devices.filter(function (el) {
						return el != null;
					});
				}
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

function VerifyDeviceKey(device, key, dbo){
	return new Promise(function(resolve, reject) {
		// Query database by iterating over
		var query = { _id: device };
		dbo.collection("devices").find(query).toArray(function(err, result) {
			if (err){
				reject("error");
			}else{
				if(result.length > 0){
					if(result[0].key == key){
						resolve("ok");
					}else{
						reject("invalid");
					}
				}else{
					reject("notfound");
				}
			}
		})
    })
}

function AddDeviceToUser(device, email, dbo){
	return new Promise(function(resolve, reject) {
		// Query database by iterating over
		try{
			dbo.collection("users").findByIdAndUpdate(email,{$push: {devices: device}},{safe: true, upsert: true},
				function(err, doc) {
					if(err){
						reject(err);
					}else{
						resolve("ioko");
					}
				}
			);
		}catch(e){
			reject(e);
		}
    })
}

function prepareDeviceData(userEmail){
	return new Promise(function(resolve, reject) {
		var promiseMongo = initDBConnection();

		promiseMongo.then(function(dbo){
			//console.log("Connected to mongo database. " + dbo.domain);
			findDevices(userEmail, dbo).then(function(devicex){
				findSubDevices(devicex, dbo).then(function(subDevice){
					console.log(JSON.stringify(subDevice, null, 4));
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
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));
app.use('/update', express.static(__dirname + '/update'));

app.get('/', async function (req, res) {
	try{
		const userEmail = await getEmail(req.headers);
		//const userEmail = "sanjeet.pathak990@gmail.com";
		if(userEmail != undefined && userEmail != null && userEmail != ""){
			//console.log(userEmail);
			var devices = await prepareDeviceData(userEmail);
			var data = {
				agentUserId: userEmail,
				devices
			};
			res.send(data);
		}else{
			res.send("Invalid token supplied.");
		}
	}catch(e){
		res.send("error");
	}
})
 
app.get('/status', async function (req, res) {
	try{
		const userEmail = await getEmail(req.headers);
		var deviceId = req.body.deviceID;
		
		if(userEmail != undefined && userEmail != null && userEmail != ""){
			var data = [];
			var deviceData = await dbo.collection("devices").find({ _id: deviceId }).toArray()
			
			var promise = new Promise((resolve, reject) => {
				deviceData[0].subDevices.forEach(async (dataX, index, array) => {	
					var dataArray = await dbo.collection("status").find({ _id: dataX.id }).toArray();
					dataArray.forEach(singleObj => {
						data.push({"id" : singleObj._id, "status" : singleObj.running});
					});
					if(index === array.length - 1) resolve();
				});		
			});
			promise.then(() => {
				res.send(JSON.stringify(data, null, 4));
			});
		}else{
			res.send("Invalid token supplied.");
		}
	}catch(e){
		res.send("error");
	}
})
 
app.post('/add', async function (req, res) {
	try{
		const userEmail = await getEmail(req.headers);
		//const userEmail = "sanjeet.pathak990@gmail.com";
		if(userEmail != undefined && userEmail != null && userEmail != ""){
			var deviceId = req.body.deviceID;
			var secretkey = req.body.secretKey;

			var promiseMongo = initDBConnection();

			promiseMongo.then(function(dbo){
				dbo.collection("users").find({"devices":{$all :[deviceId]}}).toArray(function(err, result) {
					if(err){
						res.send("error");
					}else{
						if(result[0] == undefined || result[0] == null){
							var promiseDeviceVerify = VerifyDeviceKey(deviceId, secretkey, dbo);
							promiseDeviceVerify.then(async function(data){
								dbo.collection("users").findOneAndUpdate({ _id: userEmail }, {$push: {devices: deviceId}}, {upsert:true,strict: false},
									function(err, doc) {
										if(err){
											res.send("unknown");
										}else{
											res.send("okay");
										}
									}
								);
							}, function(error){
								res.send(error);
							})
						}else if(result[0]._id == userEmail){
							res.send("duplicate");
						}else{
							res.send("exists:" + result[0]._id);
						}
					}
				})
			}, function(error){
				res.send("error");
			})

			//res.send(deviceId + " - " + secretkey + "");
			//res.end(promiseDeviceVerify);
		}else{
			res.send("Invalid token supplied.");
		}
	}catch(e){
		res.send("error " + e);
	}
})
 
app.post('/remove', async function (req, res) {
	try{
		const userEmail = await getEmail(req.headers);
		//const userEmail = "sanjeet.pathak990@gmail.com";
		if(userEmail != undefined && userEmail != null && userEmail != ""){
			var deviceId = req.body.deviceID;
			var promiseMongo = initDBConnection();

			promiseMongo.then(function(dbo){
				dbo.collection("users").find({"devices":{$all :[deviceId]}}).toArray(function(err, result) {
					if(err){
						res.send("error");
					}else{
						if(result[0] == undefined || result[0] == null){
							res.send("notexists");
						}else if(result[0]._id == userEmail){
							dbo.collection("users").findOneAndUpdate({ _id: userEmail }, {$pop: {devices: deviceId}}, {upsert:true,strict: false},
								function(err, doc) {
									if(err){
										res.send("unknown");
									}else{
										res.send("okay");
									}
								}
							);
						}else{
							res.send("autherror");
						}
					}
				})
			}, function(error){
				res.send("error");
			})
		}else{
			res.send("Invalid token supplied.");
		}
	}catch(e){
		res.send("error " + e);
	}
})
 
app.get('/exists', async function (req, res) {
	try{
		const userEmail = await getEmail(req.headers);
		//const userEmail = "sanjeet.pathak991@gmail.com";
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

app.post('/setType', async function (req, res) {
	try{
		const userEmail = await getEmail(req.headers);
		//const userEmail = "sanjeet.pathak990@gmail.com";
		if(userEmail != undefined && userEmail != null && userEmail != ""){
			var deviceId = req.body.deviceID;
			var SubDeviceId = req.body.subDeviceID;
			var type = req.body.type;
			var promiseMongo = initDBConnection();

			promiseMongo.then(function(dbo){
				dbo.collection("devices").find({"_id":deviceId, "subDevices":{$elemMatch :{"id" : SubDeviceId}}}).toArray(function(err, result) {
					if(err){
						res.send("error");
					}else{
						if(result[0] == undefined || result[0] == null){
							res.send("notexists");
						}else{
							dbo.collection("users").find({"devices":{$all :[deviceId]}}).toArray(function(err, result) {
								if(err){
									res.send("error");
								}else{
									if(result[0] == undefined || result[0] == null){
										res.send("notexists");
									}else if(result[0]._id == userEmail){
										dbo.collection("devices").findOneAndUpdate({ _id: deviceId, "subDevices.id": SubDeviceId}, {$set: {"subDevices.$.type": type}}, {upsert:true,strict: false},
											function(err, doc) {
												if(err){
													res.send("unknown" + err);
												}else{
													res.send("okay");
												}
											}
										);
									}else{
										res.send("autherror");
									}
								}
							})
						}
					}
				})
			}, function(error){
				res.send("error");
			})
		}else{
			res.send("Invalid token supplied.");
		}
	}catch(e){
		res.send("error " + e);
	}
})
 
app.post('/renameSubDevice', async function (req, res) {
	try{
		const userEmail = await getEmail(req.headers);
		//const userEmail = "sanjeet.pathak990@gmail.com";
		if(userEmail != undefined && userEmail != null && userEmail != ""){
			var deviceId = req.body.deviceID;
			var SubDeviceId = req.body.subDeviceID;
			var name = req.body.name;
			var promiseMongo = initDBConnection();

			promiseMongo.then(function(dbo){
				dbo.collection("devices").find({"_id":deviceId, "subDevices":{$elemMatch :{"id" : SubDeviceId}}}).toArray(function(err, result) {
					if(err){
						res.send("error");
					}else{
						if(result.length < 1){
							res.send("notexists");
						}else{
							dbo.collection("users").find({"devices":{$all :[deviceId]}}).toArray(function(err, result) {
								if(err){
									res.send("error");
								}else{
									if(result[0] == undefined || result[0] == null){
										res.send("notexists");
									}else if(result[0]._id == userEmail){
										dbo.collection("devices").findOneAndUpdate({ _id: deviceId, "subDevices.id": SubDeviceId}, {$set: {"subDevices.$.name": name, "subDevices.$.defaultNames": name, "subDevices.$.nicknames": name}}, {upsert:true,strict: false},
											function(err, doc) {
												if(err){
													res.send("unknown" + err);
												}else{
													res.send("okay");
												}
											}
										);
									}else{
										res.send("autherror");
									}
								}
							})
						}
					}
				})
			}, function(error){
				res.send("error");
			})
		}else{
			res.send("Invalid token supplied.");
		}
	}catch(e){
		res.send("error " + e);
	}
})
 
app.post('/reorder', async function (req, res) {
	try{
		//const userEmail = await getEmail(req.headers);
		const userEmail = "sanjeet.pathak990@gmail.com";
		if(userEmail != undefined && userEmail != null && userEmail != ""){
			var deviceId = req.body.deviceID;
			var SubDeviceId = req.body.subDeviceID;
			var order = req.body.order;
			var promiseMongo = initDBConnection();
			var name = "";
		
			console.log(order[0]);
			console.log(order[1]);

			promiseMongo.then(function(dbo){
				dbo.collection("users").find({"devices":{$all :[deviceId]}}).toArray(function(err, result) {
					if(err){
						res.send("error");
					}else{
						if(result[0] == undefined || result[0] == null){
						res.send("notexists2");
						}else if(result[0]._id == userEmail){
							dbo.collection("devices").findOneAndUpdate({ _id: deviceId, "subDevices.id": SubDeviceId}, {$set: {"subDevices.$.name": name, "subDevices.$.defaultNames": name, "subDevices.$.nicknames": name}}, {upsert:true,strict: false},
								function(err, doc) {
									if(err){
										res.send("unknown" + err);
									}else{
										res.send("okay");
									}
								}
							);
						}else{
							res.send("autherror");
						}
					}
				})
			}, function(error){
				res.send("error");
			})
		}else{
			res.send("Invalid token supplied.");
		}
	}catch(e){
		res.send("error " + e);
	}
})
 
app.listen(port, () => console.log("Example app listening.! " + port))
