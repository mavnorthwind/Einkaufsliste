'require strict';

const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('node-uuid');
const path = require('path');
const parse = require('csv-parser');
const cors = require('cors');

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let whitelist = undefined;
let whitelistpath = path.resolve(__dirname, 'whitelist.json');
if (fs.existsSync(whitelistpath)) {
	whitelist = require(whitelistpath);
}

app.use(cors({
	origin: function(origin, callback) {
		if (!origin || !whitelist || whitelist.indexOf(origin) >= 0) {
			return callback(null, true);
		}
		var message = "The CORS policy for this origin (" +
				origin +
				")  doesn't " +
				"allow access from that origin.";
		return callback(new Error(message), false);
	}
}));

//app.use(function (req, res, next) {
//	res.header("Access-Control-Allow-Origin", "*");
//	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
//	res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE");
//	next();
//});

var listPath = path.resolve(__dirname, 'liste.json');
var list = getList();

var suggestionPath = path.resolve(__dirname, 'suggestion.json');
var productsPath = getProductLogPath();

updateSuggestion(); // update once at startup
setInterval(updateSuggestion, 1000*60*60*24); // and update suggestions once a day

// Initialisierung
function getList() {
	var list = {
		Name: 'Einkaufsliste',
		Items: [],
		AddTimestamp: 0,
		DeleteTimestamp: 0
		};

	try {
		if (fs.existsSync(listPath)) {
			delete require.cache[require.resolve(listPath)];
			list = require(listPath);
		}
	} catch (ex)
	{
		console.error("Exception reading list: " + ex);
	}

	return list;
}

function getSuggestion(max, sort, min) {
	var sug = [];

	min = min || 2; // items have to occur twice at least to be added

	if (fs.existsSync(suggestionPath)) {
		delete require.cache[require.resolve(suggestionPath)];
		sug = require(suggestionPath);
	}

	sug = sug.filter(item => item.Count>=min);

	if (!sort || sort === 'alpha')
	{
		sug.sort((a,b) => a.Name.localeCompare(b.Name));
	}
	if (sort === 'count')
	{
		sug.sort((a,b) => b.Count-a.Count);
	}

	if (max && max > 1)
		sug.splice(max);

	return sug;
}

function getLuisProducts(count) {
	var sug = getSuggestion(count, "count");

	
	var products = "{";
	for (var p of sug) {
		products = products + "\"" + p.Name + "\":[],";
	};
	products = products.slice(0,-1); // strip last comma
	products = products+"}";
	
	
	return JSON.parse(products);
}

function writeSuggestion(sug) {
	fs.writeFileSync(suggestionPath, JSON.stringify(sug));
}

function updateSuggestion() {
	extractProductFrequency(f => writeSuggestion(f));
}

function buildHistogram(data) {
	var histo = [];

	for (d of data) {
		var entry = histo.find(e => e.Name === d);
		if (!entry) {
			entry = {Name: d, Count: 0};
			histo.push(entry);
		}

		entry.Count++;
	}

	return histo;
}

function extractProductFrequency(callback) {
	const products = [];

	fs.createReadStream(productsPath)
		.pipe(parse({separator: ';', headers: ['Timestamp','Operation','Name','Amount','Unit']}))
		.on('data', (data) => {
			if (data.Operation=='ADD')
				products.push(data.Name);
		})
		.on('end', () => {
			console.log("Products:");
			console.log(products);
			console.log("Histogram:");
			var frequency = buildHistogram(products);
			console.log(frequency);
			callback(frequency);
		});
}

function parseAmount(input) {
  if (input == undefined) {
    return { Amount: undefined, Unit: undefined };
  }

  // Regular expression to match numeric amount and optional string unit
  const regex = /^(\d+)([a-zA-Z]+)?$/;

  // Use the regular expression to extract matches
  const matches = input.match(regex);

  if (!matches) {
    return { Amount: undefined, Unit: undefined };
  }

  // Extract the numeric amount and optional string unit
  const amount = parseInt(matches[1], 10);
  const unit = matches[2] || null;

  // Create and return the object
  const result = { Amount: amount, Unit: undefined };

  if (unit) {
    result.Unit = unit;
  }

  return result;
}

function AddProductToExisting(newProduct, existingProduct) {
	if (existingProduct.Unit == newProduct.Unit) {
		existingProduct.Amount += newProduct.Amount;
	} else {
		existingProduct.Unit = newProduct.Unit;
		existingProduct.Amount = newProduct.Amount;
	}
}

function addToList(newItem) {
	if (newItem.Product == null)
		return;

	list.AddTimestamp = new Date().valueOf();

	newItem.Product = newItem.Product.trim();
	
	var amount = parseAmount(newItem.Amount);

	if (amount.Unit == undefined && !isNaN(amount.Amount))
		amount.Unit = "St.";
	
	newItem.Amount = amount.Amount;
	newItem.Unit = amount.Unit;

	for (var i = 0; i < list.Items.length; i++) {
		var p = list.Items[i];
		if (p.Product.toUpperCase() == newItem.Product.toUpperCase()) {
			AddProductToExisting(newItem, p);
			return;
		}
	}

	newItem.ID = uuid.v4();
	list.Items.push(newItem);
	list.Items.sort((a, b) => a.Product.localeCompare(b.Product));

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
		return '"' + val + '"';
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

app.get('/luisproducts' , function(req, res){
	res.end(JSON.stringify(getLuisProducts(req.query.count)));
});

app.get('/suggestion' , function(req, res){
	res.end(JSON.stringify(getSuggestion(req.query.max, req.query.sort, req.query.min)));
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
