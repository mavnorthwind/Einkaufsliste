const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('node-uuid');
const path = require('path');

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(function (req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE");
	next();
});

var listPath = path.resolve(__dirname, 'liste.json');
var suggestionPath = path.resolve(__dirname, 'suggestion.json');
var list;

// Initialisierung
if (fs.existsSync(listPath))
	list = require(listPath);
else
	list = {
		Name: 'Einkaufsliste',
		Items: [],
		AddTimestamp: 0,
		DeleteTimestamp: 0
		};

function getSuggestion() {
	delete require.cache[require.resolve(suggestionPath)];

	var sug = {
		Items: ["Brot","Käse","Wurst"]
		};

	if (fs.existsSync(suggestionPath))
		sug = require(suggestionPath);
	
	return sug;
}

function addToList(newItem) {
	if (newItem.Product == null)
		return;

	list.AddTimestamp = new Date().valueOf();
	
	newItem.Product = newItem.Product.trim();
	var amount = parseInt(newItem.Amount);
	if (isNaN(amount))
		newItem.Unit = undefined;
	else
		if (newItem.Unit == null || newItem.Unit == undefined)
			newItem.Unit = "St.";
	
	for (var i = 0; i < list.Items.length; i++) {
		var p = list.Items[i];
		if (p.Product.toUpperCase() == newItem.Product.toUpperCase()) {
			if (!isNaN(amount)) {
				var oldAmount = parseInt(p.Amount, 10);
				if (isNaN(oldAmount))
					p.Amount = 0;
				
				p.Amount = oldAmount + amount;
				console.log(amount + " added to " + p.Product);
			}
			return;
		}
	}

	newItem.ID = uuid.v4();
	list.Items.push(newItem);
	list.Items.sort(function (a, b) {
		var p1 = a.Product.toUpperCase();
		var p2 = b.Product.toUpperCase();
		if (p1 > p2) return 1;
		if (p2 > p1) return -1;
		return 0;
	});
	
	logItemAdd(newItem);
	
	console.log(newItem.Product + " added to list");
};

function deleteByID(id) {
	console.log("Trying to delete product with id '"+id+"'");
	for (var i = 0; i < list.Items.length; i++) {
		var p = list.Items[i];

		if (id == p.ID) {
			list.Items.splice(i, 1);
			list.DeleteTimestamp = new Date().valueOf();
			console.log("Product " + id + " removed from list");
			logItemDelete(p);
			return;
		}
	}
	console.warn("Product " + id + " not found in list");
}

function deleteByIndex(index) {
	var item = list.Items[index];
	deleteByID(item.ID);
};

function deleteByName(product) {
	var prod = product.trim().toUpperCase();
	for (var i = 0; i < list.Items.length; i++) {
		var p = list.Items[i];
		var existing = p.Product.trim().toUpperCase();
		if (existing == prod) {
			deleteByID(p.ID);
			return;
		}
	}

	console.log(product + " not in list!");
};

function sendFile(fileName, root, req, res){
	var options = {
		root: __dirname + root,
		dotfiles: 'deny',
		headers: {
			'x-timestamp': Date.now(),
			'x-sent': true
		}
	};
	res.sendFile(fileName, options, function (err) {
		if (err) {
			console.log(err);
			res.status(err.status).end();
		} else {
			console.log('Sent:' + root + fileName + " to " +req.ip);
		}
	});
};

function writeList()
{
	fs.writeFileSync(listPath, JSON.stringify(list));
}

function makeSafeForCSV(val) {
	if (val.indexOf(';') >= 0)
		return "'" + val + "'";
	else
		return val;
}
function getProductLogPath() {
	return path.resolve(__dirname, 'products.csv');
}
function formatItemForLog(item) {
	var prod = makeSafeForCSV(item.Product);
	
	return prod + ';' + (item.Amount || "") + ';' + (item.Unit || "");
}
function logItemAdd(item) {
	fs.appendFileSync(getProductLogPath(), new Date().toJSON() + ';ADD;' + formatItemForLog(item) + '\n');
}

function logItemDelete(item) {
	fs.appendFileSync(getProductLogPath(), new Date().toJSON() + ';DEL;' + formatItemForLog(item) + '\n');
}

app.get('/', function (req, res) {
	res.end(JSON.stringify(list));
});

app.get('/edit', function(req, res){
	var options = {
		root: __dirname,
		dotfiles: 'deny',
		headers: {
			'x-timestamp': Date.now(),
			'x-sent': true
		}
	};
	var fileName = "EditList.html";
	
	res.sendFile(fileName, options, function (err) {
		if (err) {
			console.log(err);
			res.status(err.status).end();
		}
		else {
			console.log('Sent:' + fileName + " to " +req.ip);
		}
	});
});

app.get('/resources/:file', function(req, res){
	sendFile(req.params.file, '/resources/', req, res);
});

app.get('/suggestion' , function(req, res){
	res.end(JSON.stringify(getSuggestion()));
});

app.post('/', function (req, res) {
	console.log("ADD PRODUCT: " + JSON.stringify(req.body));
	product = req.body;
	addToList(product);
	writeList();
	res.end(JSON.stringify(list));
});

app.delete('/index/:index', function (req, res) {
	console.log("DELETE /index/...");
	var index = req.params.index;
	console.log("DELETE product by index: " + index);
	deleteByIndex(index);
	writeList();
	res.end(JSON.stringify(list));
});

app.delete('/product/:id', function (req, res) {
	console.log("DELETE /product/...");
	var id = req.params.id;
	console.log("DELETE product by id: " + id);
	deleteByID(id);
	writeList();
	res.end(JSON.stringify(list));
});

app.delete('/product/name/:product', function (req, res) {
	console.log("DELETE /product/name/...");
	var product = decodeURIComponent(req.params.product);
	console.log("DELETE product by name: " + product);
	deleteByName(product);
	writeList();
	res.end(JSON.stringify(list));
});

var server = app.listen(8081, function () {
	var host = server.address().address
	var port = server.address().port

	console.log("Einkaufslisten-Server auf http://%s:%s", host, port)

	console.log(list);
});

