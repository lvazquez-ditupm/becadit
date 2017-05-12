// Dependencies
var chokidar = require('chokidar'),
    fs = require('fs'),
    nodePath = require('path'),
    csv = require('fast-csv'),
    moment = require('moment'),
    async = require('async'),
    request = require('request'),
    jsonfile = require('jsonfile'),
    math = require('mathjs');


console.log("TEST")



// Local variables 
var uploadDir = "./uploads/",
    storedDataDir = "./storedData/";

// Create watchers
var uploadsWatcher = chokidar.watch(nodePath.resolve(uploadDir), { // Whole dir watcher
        ignored: "temp",
        ignoreInitial: true,
        persistent: true,
        depth: 1
    }).on('ready', path => uploadsScanComplete(path))
    .on('add', (path, stats) => {
        upAddedFile(path, stats);
    })
    .unwatch(nodePath.dirname(nodePath.resolve(uploadDir)));

var storedWatcher;

// Save anomaly results to .json file
function saveResults(res, callback) {
    var results = JSON.parse(res);
    var anoms = results.anomsMatrix;
    var dataset = results.dataset;
    var resultsPath = dataset + ".json";
    var prevResults = jsonfile.readFile(resultsPath, function(err, obj) {
        if (!err) {
            // File exists: there's results. Read previous anomalies and subtract with current to get new ones.
            
            var diff = math.subtract(anoms, obj.newAnoms);
            diff.forEach(function(el, index) {
                if (el < 0) {
                    diff[index] = 0;
                }
            });
            if (math.max(diff) > 0) {
                console.log("WARNING: New anomalies in dataset " + nodePath.basename(dataset) + ". Diff: " + diff);
            } else {
                console.log("No new anomalies in dataset. Diff: " + diff);
            }
            jsonfile.writeFile(resultsPath, { anoms: anoms, newAnoms: diff }, function(err) {
                if (err) {
                    callback(err);
                } else {
                    console.log("Finished writing new results to " + nodePath.basename(resultsPath));
                    callback();
                }
            });
            filterAnomalies(dataset, diff);
        } else {
            // File doesn't exist: there's no previous results. New anomalies are all current ones.
            jsonfile.writeFile(resultsPath, { anoms: anoms, newAnoms: anoms }, function(err) {
                if (err) {
                    callback(err);
                } else {
                    console.log("Finished writing new results to " + nodePath.basename(resultsPath));
                    callback();
                }
            });
            filterAnomalies(dataset, anoms);
        }
    })
}

function storedScanComplete() {
    var watchedSt = storedWatcher.getWatched();
    console.log("ST Watchdog: Finished scanning directory " + storedDataDir);
    console.log("ST Watchdog: Watching following paths: " + Object.keys(watchedSt).toString());
    var dataSetFolders = watchedSt[nodePath.resolve(storedDataDir)];
    var dataSets = [];
    async.each(dataSetFolders, function(dataset, callback) {
        var tempDS = watchedSt[nodePath.resolve(storedDataDir + "" + dataset)];
        tempDS.forEach(function(ds, index) {
            if (ds.includes(".csv")) {
                dataSets.push(nodePath.resolve(storedDataDir + "" + dataset + "" + nodePath.sep + "" + ds));
            }
        });
        callback();
    }, function(err) {
        if (!err) {
            var results = [];
            dataSets.forEach(function(ds) {
                var configPath = nodePath.dirname(ds) + "" + nodePath.sep + "config.dharma";
                callRFunction('/library/findAllJointAnomalies/R/findAllJointAnomalies', { file: ds, config: configPath }, function(err, res) {
                    if (!err) {
                        console.log("Received results from R server.");
                        var resultsPath = res.match("/ocpu/tmp/([a-z0-9]*)/")[1];
                        // Get results of findAnomalies for our dataset
                        callRFunction('/tmp/' + resultsPath + '/R/.val', undefined, function(err, res2) {
                            if (!err) {
                                saveResults(res2, function(err) {
                                    if (err) {
                                        console.log("Error saving anomaly results. Error code: " + err);
                                    }
                                });
                            } else {
                                console.log("Couldn't get R results. Error code: " + err);
                            }
                        })
                    } else {
                        console.log("R server couldn't process joint anomalies. Error code: " + err);
                    }
                });

            })
        }
    });
};


function callRFunction(command, args, callback, options) {
    var opts = options || {},
        url,
        method = args ? "POST" : "GET";

    opts.server = opts.server || "http://localhost";
    opts.port = opts.port || "5307"
    opts.root = opts.root || "/ocpu";

    url = opts.server + ":" + opts.port + opts.root + command;

    request({
        method: method,
        uri: url,
        body: JSON.stringify(args),
        headers: { "Content-Type": "application/json" }
    }, function(err, response, data) {
        err = err || (response && (response.statusCode === 400 ||
            response.statusCode === 502 ||
            response.statusCode === 503) && response.statusCode);
        callback(err, data);
    });
};

// Runs when file has been changed in stored data: implies new data, so find new anomalies.
function stChangedFile(path, stats) {
    if (!path.includes("config.dharma") && !path.includes(".json")) {
        var configPath = nodePath.dirname(path) + "" + nodePath.sep + "config.dharma";
        callRFunction('/library/findAllJointAnomalies/R/findAllJointAnomalies', { file: path, config: configPath }, function(err, res) {
            if (!err) {
                console.log("Received results from R server.");
                var resultsPath = res.match("/ocpu/tmp/([a-z0-9]*)/")[1];
                // Get results of findAnomalies for our dataset
                callRFunction('/tmp/' + resultsPath + '/R/.val', undefined, function(err, res2) {
                    if (!err) {
                        saveResults(res2, function(err) {
                            if (err) {
                                console.log("Error saving anomaly results after file change. Error code: " + err);
                            }
                        });
                    } else {
                        console.log("Couldnt get R results. Error code: " + err);
                    }
                })
            } else {
                console.log("R server couldn't process joint anomalies. Error code: " + err);
            }
        });
    }
}


var configWatcher; // Watcher for datasets with no config

// <Uploads watchdog actions>
// When scan is complete, log and parse data
function uploadsScanComplete(path) {
    var watched = uploadsWatcher.getWatched();
    console.log("UP Watchdog: Finished scanning directory " + uploadDir);
    console.log("UP Watchdog: Watching following paths: " + Object.keys(watched).toString());
    async.series([function(callback) {
        return parseDirContents(watched, callback);
    }, function(callback) {
        storedWatcher = chokidar.watch(nodePath.resolve(storedDataDir), { // Stored data dir watcher
                ignored: ["week", "month", "year", "day", ".json"],
                ignoreInitial: true,
                persistent: true,
                depth: 1
            }).on('ready', storedScanComplete) // IMPLEMENT
            .on('change', (path, stats) => { stChangedFile(path, stats) })
            .unwatch(nodePath.dirname(nodePath.resolve(storedDataDir)))
    }], function(err, results) {
        if (err) {
            console.log("Error while parsing uploads. " + err);
        };
    });
};

// When new file
function upAddedFile(path, stats) {

    // Check if config. If not, save in temp dataset and continue

    //If our configWatcher exists and is watching this file's parent dir, check if config
    if (configWatcher && Object.keys(configWatcher.getWatched()).toString.includes(nodePath.parentDir(path))) {
        if (path.includes(".dharma")) {
            // We have a new config! Parse it
            createInnerFolders(nodePath.basename(nodePath.dirname(path)), function(err) {
                if (!err)
                    fs.unlink(path);
            });
        }
    } else {
        // Our dir isn't being watched by configWatcher: it's new data 
        parseDatasetConfig(path, watched[path]);
    }
};

// When file modified
function upChangedFile(path, stats) {

    // Check if config in dir. If not, save in temp dataset and continue 

    // If config, parse data 

};

// When new folder
function upAddedDir(path, stats) {


};
// </Uploads watchdog actions>


// Parse data in whole directory
// Called after watcher finishes scanning dir for the first time
// var watchedDirs - output of watcher.getWatched() 
function parseDirContents(watchedDirs, callback) {
    // Check all watched dirs
    var datasets = watchedDirs[nodePath.resolve(uploadDir)];
    async.each(datasets, function(dataset, callback3) {
            if (!dataset.includes("global.dharma") && !dataset.includes(".json")) {
                async.series([function(callback2) {
                    createInnerFolders(dataset, callback2);
                }, function(callback2) {
                    var datasetPath = nodePath.resolve(uploadDir) + "" + nodePath.sep + "" + dataset;
                    if (watchedDirs[datasetPath] && watchedDirs[datasetPath].toString().includes("config.dharma")) { // We have config file: parse data
                        parseDatasetConfig(datasetPath, watchedDirs[datasetPath], callback2);
                        //------------------------------------------------ COPIAR CONFIG.DHARMA EN STOREDDATA --------------------------------------------------
                    } else {
                        // Dataset doesn't have a personal config file: move it and watch it separately
                        configMissingInDataset(datasetPath, watchedDirs[datasetPath], callback2);
                    };
                }], function(err) {
                    return callback3(err);
                });
            } else {
                return callback3(null);
            };
        },
        function(err) {
            console.log("All datasets processed successfully");
            return callback(err);
        });
};

function parseDatasetConfig(dsPath, files, callback) {
    var config = JSON.parse(fs.readFileSync(dsPath + "" + nodePath.sep + "config.dharma"));
    var dsName = nodePath.basename(dsPath);

    var dataFiles = files.filter(function(el, index) {
        if (el.includes(".dharma") || el.includes("temp")) {
            return false;
        } else {
            return true;
        }
    });


    // Lo he implementado así porque creo que config.times va a ser un objeto y no un array, y no hay filter para objetos. 
    // Cambiar a lo de arriba si no es así y borrar la implementación de Object.filter (al final del todo)

    configTimes = []

    for(var x in config.times[0]){
      configTimes.push(config.times[0][x]);
    }             

    var tstamps = configTimes.filter(function(el, index) {
        if (el.includes("Not") || el.includes("Unix")) {
            return false;
        } else {
            return true;
        }
    });
  
    async.eachSeries(dataFiles, function(file, callback2) {
        var filePath = dsPath + "" + nodePath.sep + "" + file;
        var formatStream = csv
            .createWriteStream({ headers: true })
            .transform(function transformTstamps(obj) {
                var key;
                for (key in tstamps) {
                    //FORMAT TIME FOR THIS DATA
                    obj[key] = moment(obj[key], tstamps[key]).unix();
                }
                async.each(destPathsFromTstamps(obj, config.mainTime, dsName), function(dest, callback3) {
                    fs.appendFile(dest, getObjectValues(obj, config.names), function(err) {
                        return callback3(err);
                    });
                }, function(err) {
                    if (err) {
                        throw (err);
                    } else {
                        return obj;
                    }
                });
            });
        var datacount = 0;
        var readStream =
            csv.fromPath(filePath, { headers: true })
            .pipe(formatStream)
            .on('data', function(data) {
                datacount++;
            })
            .on('end', function() {
                return callback2(null);
            });
    }, function(err) {
        if (callback) {
            return callback(err);
        };
    });

}

// Parse config of a dataset.
// Only called when there's an actual config in the dataset directory!
// var data - object with data information. This is what we will save in datasets. Timestamps are formatted to Unix time.
// var tstamp - variable that contains the timestamp we will use to save data in one file or another. If empty, we will save it in main dataset.
// var dsName - name of the dataset. We need it to know where to save our data.
function destPathsFromTstamps(data, tstamp, dsName) {

    // ------------------------------------------------ GOT TO DO SOME STUFF WITH WATCHERS, RIGHT? ---------------------------------------

    var dests = [];
    if (tstamp != "") {
        var globalConfig = JSON.parse(fs.readFileSync(nodePath.resolve(uploadDir) + "" + nodePath.sep + "global.dharma"));
        var matched = true;
        var configSrcPath = nodePath.resolve(uploadDir) + "" + nodePath.sep + "" + dsName + "" + nodePath.sep + "config.dharma";
        fs.stat(configSrcPath, function(err, stats) {
            if (stats.isFile()) {
                var configDestPath = nodePath.resolve(storedDataDir) + "" + nodePath.sep + "" + dsName + "" + nodePath.sep + "config.dharma";
                fs.createReadStream(configSrcPath).pipe(fs.createWriteStream(configDestPath));
            }
        });

        for (key in globalConfig) {
            var destPath = nodePath.resolve(storedDataDir) + "" + nodePath.sep + "" + dsName + "" + nodePath.sep + "" + dsName + "_";
            switch (key) {
                case "Week":
                    destPath = destPath + "week_";
                    var i;
                    var realCurrTstamp = moment(data[tstamp], "X");
                    var currTstamp = moment().seconds(realCurrTstamp.seconds()).minute(realCurrTstamp.minute()).hour(realCurrTstamp.hour());
                    var val = globalConfig[key][currTstamp.isoWeekday()].split("-");
                    if (currTstamp.isBetween(moment(val[0] + " +0000", "HH:mm Z"), moment(val[1] + " +0000", "HH:mm Z"), null, [])) {
                        destPath = destPath + "active.csv";
                    } else {
                        destPath = destPath + "inactive.csv";
                    };
                    break;
                case "Day":

                    break;
                case "Month":

                    break;
                case "Year":
                    destPath = destPath + "year_";
                    var checker = false;
                    var currTstamp = moment(data[tstamp], "X");
                    globalConfig[key].forEach(function(range) {
                        var splitRange = range.split("-");
                        if (currTstamp.isBetween(moment(splitRange[0] + " +0000", "DD MM Z"), moment(splitRange[1] + " +0000", "DD MM Z"))) {
                            checker = true;
                        };
                    });
                    if (checker) {
                        destPath = destPath + "active.csv";
                    } else {
                        destPath = destPath + "inactive.csv";
                    }
                    break;
                default:
                    matched = false;
            };
            if (matched) {
                dests.push(destPath);
            }
        }
    } else {
        dests.push(nodePath.resolve(storedDataDir) + "" + nodePath.sep + "" + dsName + "" + nodePath.sep + "" + dsName + ".csv");
    }
    return dests;
};

// Move files from uploads to storedData
// Called ------------------------------------------------------------ ADD CASES ------------------------------------------------------
// var sourcePath - absolute path of old files container
// var destPath - absolute path of new files container
// var files - list of files in old files
function moveFolderContents(sourcePath, destPath, files) {
    files.forEach(function(file) {
        if (!file.includes(".dharma")) {
            var oldPath = nodePath.resolve(sourcePath) + "" + nodePath.sep + "" + file;
            var newPath = nodePath.resolve(destPath) + "" + nodePath.sep + "" + file;
            fs.rename(oldPath, newPath, function(err) {
                if (err) {
                    throw err;
                }
            });
        };
    });
};

// Do what you gotta do when you h6ave uploaded data and no corresponding config: save in /temp/ and watch folder separately 
// var uploadsFilePath - full path of dataset folder in uploads
// var fileContents - list of files in dataset folder in uploads  
function configMissingInDataset(uploadsFilePath, fileContents) {
    uploadsWatcher.unwatch(uploadsFilePath); // We have data, but no config: unwatch with uploads watcher
    configWatcher.watch(uploadsFilePath, { // And watch it with config watcher
        ignored: temp,
        persistent: true,
        depth: 1
    });
    fileContents.forEach(function(fileName) {
        if (!fileName.includes("temp")) { // If file isn't /temp/ folder, move it to /temp/
            var oldDir = uploadsFilePath + "" + nodePath.sep + "" + fileName;
            var newDir = uploadsFilePath + "" + nodePath.sep + "temp" + nodePath.sep + "" + fileName;
            fs.rename(oldDir, newDir);
        };
    });
};

// Create corresponding dataset folders in storedData
// var dataset - dataset to create folders for
function createInnerFolders(dataset, callback) {
    // Create dataset folder in storedData
    var newDatasetPath = nodePath.resolve(storedDataDir) + "" + nodePath.sep + "" + dataset;
    fs.stat(newDatasetPath, function(err, stats) {
        if (err || !stats.isDirectory()) { // Create dataset folder if it doesn't exist
            fs.mkdir(newDatasetPath, function(err) {
                if (err) {
                    throw err;
                }

                // Create subfolders if global config exists
                var globalConfigPath = nodePath.resolve(uploadDir) + "" + nodePath.sep + "global.dharma";
                fs.stat(globalConfigPath, function(err, stats) {
                    if (!err && stats.isFile()) {
                        var config = JSON.parse(fs.readFileSync(globalConfigPath));
                        async.parallel([
                            function(callback2) {
                                createDir(dataset, newDatasetPath, "week", config.Week, callback2)
                            },
                            function(callback2) {
                                createDir(dataset, newDatasetPath, "month", config.Month, callback2)
                            },
                            function(callback2) {
                                createDir(dataset, newDatasetPath, "year", config.Year, callback2)
                            },
                            function(callback2) {
                                createDir(dataset, newDatasetPath, "day", config.Day, callback2)
                            }
                        ], function(err, results) {
                            if (callback) {
                                return callback(err);
                            }
                        });
                    } else {
                        return callback(null);
                    }
                }); // Create specific folders (week, month, active...) within dataset folder if we have a global config
            });
        } else {
            return callback(null);
        };
    });
};

// Create active and inactive directories
// Called when parsing config file
// var dsName - name of dataset to create folders
// var dspath - full path of dataset in uploads
// var type - dirtype (week, month, day...)
function createDir(dsName, dspath, type, configData, callback) {
    if (configData) {
        var typeDir = dspath + "" + nodePath.sep + "" + type;
        fs.writeFile(dspath + nodePath.sep + dsName + "_" + type + "_active.csv", "", function(err) {
            if (!err) {
                fs.writeFile(dspath + nodePath.sep + dsName + "_" + type + "_inactive.csv", "", function(err) {
                    if (!err) {
                        fs.mkdir(typeDir, function(err) {
                            if (!err) {
                                async.series([function(callback2) {
                                    fs.mkdir(typeDir + nodePath.sep + "active", function(err) {
                                        if (!err) {
                                            var fileName = typeDir + nodePath.sep + "active" + nodePath.sep + dsName + "_" + type + "_active_old.csv";
                                            fs.writeFile(fileName, "", function(err) {
                                                if (!err) {
                                                    return callback2(null);
                                                } else {
                                                    return callback2(err);
                                                };
                                            });
                                        } else {
                                            console.log("Couldn't create " + typeDir + " active subdir in " + typeDir + " active. Error" + err);
                                            return callback2(err);
                                        };
                                    });
                                }, function(callback2) {
                                    fs.mkdir(typeDir + nodePath.sep + "inactive", function(err) {
                                        if (!err) {
                                            var fileName = typeDir + nodePath.sep + "inactive" + nodePath.sep + dsName + "_" + type + "_inactive_old.csv";
                                            fs.writeFile(fileName, "", function(err) {
                                                if (!err) {
                                                    return callback2(null);
                                                } else {
                                                    return callback2(err);
                                                };
                                            });
                                        } else {
                                            return callback2(err);
                                        };
                                    });
                                }], function(err, results) {
                                    return callback(err);
                                });
                            } else {
                                return callback(err);
                            };
                        });
                    } else {
                        return callback(err);
                    }
                });
            } else {
                return callback(err);
            }
        });
    } else {
        return callback(null)
    };
};

function getObjectValues(object, varNames) {
    var values = [];
    varNames.forEach(function(el) {
        values.push(object[el]);
    })
    return values.join(",") + "\r";
}

function filterAnomalies(filePath, matrix){
    filePath+="";
    var dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
    var config = JSON.parse(fs.readFileSync(dirPath + "" + "/config.dharma"));
    var resultsPath = filePath + "-anomalies.json";
    var names = config.names;
    var output = "";

    for (i=0; i<names.length; i++){
        for (j=0; j<names.length; j++){
            if(Math.abs(matrix[i][j]) > 0){
                output+=names[i]+"-"+names[j]+":"+matrix[i][j]+","
            }
        }
    }
    
    if(output!==""){
        
        output = output.slice(0,-1);

        jsonfile.writeFile(resultsPath, { anomalies : output }, function(err) {
            if (err) {
                console.log("Error writing new results to " + nodePath.basename(resultsPath));
            } else {
                console.log("Finished writing new results to " + nodePath.basename(resultsPath));
            }
        });
    }
}

// from http://stackoverflow.com/a/5072145 
Object.filter = function(obj, checker) {
    var result = {},
        key;

    for (key in obj) {
        if (obj.hasOwnProperty(key) && checker(obj[key])) {
            result[key] = obj[key];
        };
    };

    return result;
};