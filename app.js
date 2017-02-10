var express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    opencpu = require('opencpu'),
    //watchdog = require('./controllers/watchdog.js'),
    btwatchdog = require('./controllers/btwatchdog.js');

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: false }));

var data = require('./routes/data.js');
app.use('/api/data', data);
app.use("/downloads", express.static(__dirname + "/downloads"));

app.use(function(req, res) {
    return res.status(404).send('Not found');
});

app.use(function(err, req, res) {
    console.log(err.message);
    return res.status(500).send('Internal error');
});

var port = 8080;

var server = app.listen(port, function() {
    console.log('Working on port ' + port);
})