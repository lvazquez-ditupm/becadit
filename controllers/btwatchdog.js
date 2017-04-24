var chokidar = require('chokidar'),
    fs = require('fs'),
    nodePath = require('path'),
    async = require('async'),
    jsonfile = require('jsonfile');

// Local variables 
var btDir = "./ubertooth/";

// Create watchers
var btWatcher = chokidar.watch(nodePath.resolve(btDir), { // Whole dir watcher
        ignored: "temp",
        ignoreInitial: true,
        persistent: true,
        depth: 1
    }).on('ready', path => btScanComplete(path))
    .on('add', (path) => {
        btAddedData(path);
    });

function btScanComplete(path) {
    var watched = btWatcher.getWatched();
    console.log("BT Watchdog finished scanning. Watching following paths: " + Object.keys(watched).toString());
    var files = watched[nodePath.resolve(btDir)];
    async.each(files, function(file, callback) {
        if (!file.startsWith("res")){
            var contents = JSON.parse(fs.readFileSync(nodePath.resolve(btDir) + "" + nodePath.sep + file));
            if (contents.type == undefined || !contents.type == "results") {
                var times = Object.keys(contents).sort().reverse();
                var resultsPath = nodePath.resolve(btDir) + "" + nodePath.sep + "res-" + file;
                if (times.length > 1) {
                    var lastel = contents[times[0]];
                    var prevel = contents[times[1]];

                    var newVisAddr = arrayDiff(lastel.visibleAddr, prevel.visibleAddr).length;
                    var newLAPs = Object.keys(lastel.LAPs).length - Object.keys(prevel.LAPs).length;
                    if (newLAPs < 0) {
                        newLAPs = 0;
                    }
                    jsonfile.writeFile(resultsPath, { type: "results", newVisibleAddress: newVisAddr, newLAPs: newLAPs }, function(err) {
                        if (err) {
                            console.log("Couldn't write results for file " + file + ". Error code: " + err);
                            callback(err);
                        } else {
                            callback();
                        }
                    })
                } else {
                    var visAddrNum = contents[times[0]].visibleAddr.length;
                    var LAPsNum = Object.keys(contents[times[0]].LAPs).length;
                    jsonfile.writeFile(resultsPath, { type: "results", newVisibleAddress: visAddrNum, newLAPs: LAPsNum }, function(err) {
                        if (err) {
                            console.log("Couldn't write results for file " + file + ". Error code: " + err);
                            callback(err);
                        } else {
                            callback()
                        }
                    });
                }
            } else {
                callback();
            }
        }
    }, function(err) {
        if (err) {
            console.log("Error parsing file. Error code:" + err);
        }
    })
};

function btAddedData(path) {
    var contents = JSON.parse(fs.readFileSync(path));
    if (contents.type == undefined || !contents.type == "results") {
        var times = Object.keys(contents).sort().reverse();
        var resultsPath = nodePath.resolve(btDir) + "" + nodePath.sep + "res-" + nodePath.basename(path);
        if (times.length > 1) {
            var lastel = contents[times[0]];
            var prevel = contents[times[1]];

            var newVisAddr = arrayDiff(lastel.visibleAddr, prevel.visibleAddr).length;
            var newLAPs = Object.keys(lastel.LAPs).length - Object.keys(prevel.LAPs).length;
            if (newLAPs < 0) {
                newLAPs = 0;
            }
            jsonfile.writeFile(resultsPath, { type: "results", newVisibleAddress: newVisAddr, newLAPs: newLAPs }, function(err) {
                if (err) {
                    console.log("Couldn't write results for file " + file + ". Error code: " + err);
                }
            })
        } else {
            var visAddrNum = contents[times[0]].visibleAddr.length;
            var LAPsNum = Object.keys(contents[times[0]].LAPs).length;
            jsonfile.writeFile(resultsPath, { type: "results", newVisibleAddress: visAddrNum, newLAPs: LAPsNum }, function(err) {
                if (err) {
                    console.log("Couldn't write results for file " + file + ". Error code: " + err);
                }
            });
        }
    }
};

function arrayDiff(arr1, arr2) {
    var els1 = arr1.filter(function(i) { return arr2.indexOf(i) < 0; });
    var els2 = arr2.filter(function(i) { return arr1.indexOf(i) < 0; });
    return els1.concat(els2);
};