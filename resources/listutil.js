	function updateList(json) {
		var list = JSON.parse(json);
		var div = document.getElementById('list');
		var html = "<h2>" + list.Name + "</h2>";
		html += "<table class='slippylist' id='table' data-addTS='" + list.AddTimestamp + "' data-delTS='" + list.DeleteTimestamp + "'>";
		html += "<thead><tr><th></th><th>Produkt</th><th>Menge</th></tr></thead>";
		html += "<tbody id='tbody'>";
		
		for (var i = 0; i < list.Items.length; i++)
		{
			var amount = parseInt(list.Items[i].Amount, 10);
			if (isNaN(amount))
				amount = "&nbsp;";
			else
				amount = list.Items[i].Amount + " " + list.Items[i].Unit;

			html += "<tr>";
			// empty cell for delete-icon
			html += "<td></td>"; 
			// product name
			html += "<td>" + list.Items[i].Product + "</td>";
			// product amount
			html += "<td style='text-align:center;'>" + amount + "</td>";
			//html += "<td><img src='resources/del.png' onclick='delItem(\""+list.Items[i].Product+"\")' /></td>";
			// product ID in hidden cell
			html += "<td style='display: none'>" + list.Items[i].ID + "</td>";
			html += "</tr>\n";
		}
		html += "</tbody>";
		html += "</table>";

		div.innerHTML = html;
		var tbody = document.getElementById("tbody");
		if (tbody) {
			new Slip(tbody);
			tbody.addEventListener("slip:beforeswipe", function(e) {
				var signcell = e.target.parentNode.firstChild;
				var sign = document.createElement("img");
				var src = document.createAttribute("src");
				src.value = "resources/del.png";
				sign.setAttributeNode(src);
				signcell.appendChild(sign);
			});

			tbody.addEventListener("slip:cancelswipe", function(e) {
				var signcell = e.target.firstChild;
				signcell.removeChild(signcell.firstChild);
			});

			tbody.addEventListener("slip:animateswipe", function(e) {
				if (e.detail.x < 0) // if swipe to left
					e.preventDefault(); // don't allow this	
			});

			tbody.addEventListener("slip:beforereorder", function(e) {
				e.preventDefault();
			});

			tbody.addEventListener("slip:swipe", function(e) {
				if (e.detail.direction == "left") { // no left-swipe!
					e.preventDefault();
					return;
				}

				var row = e.target;
				var productID = e.target.firstChild.nextSibling.nextSibling.nextSibling.innerText.trim();
				delItem(productID, row, (list) => {
					// check if list has to be updated
					var lastAddTimestamp = list.AddTimestamp;
					var table = document.getElementById('table');
					var currentAddTimestamp = table.getAttribute("data-addts");
					if (currentAddTimestamp != lastAddTimestamp)
						updateList(list);
					else
						row.parentElement.removeChild(row); // just removing is enough
				});
			});
		}
	}

	function fillProductDatalist() {
		var sel = document.getElementById('food');
		sel.innerHTML = "";
		
		sendRequest('GET', "suggestion", null, (s) => {
			var suggestions = JSON.parse(s);
			var items = "";
			for (s of suggestions) {
				items += "<option value='" + s.Name + "'/>\n";
			};
			sel.innerHTML = items;
		});
	}
	
	function getProduct() {
		var res = new Object();
		res.Amount = undefined;

		var prod = document.getElementById('product').value;
		if (!prod || prod.trim().length == 0)
			return null;

		// Mögliche Kombinationen:
		// Wurst
		// 10 Eier
		// Eier 10
		// Eier 10St.
		// 500g Nudeln
		// Gemischtes Gulasch 1kg
		var re = new RegExp("\\s+");
		//var re = new RegExp("([0-9]+\\S*)");
		var reUnit = new RegExp("[0-9]+(\\S*)");
		var parts = prod.split(re);
		var product = "";
		var hasUnit = false;

		for (var i = 0; i < parts.length; i++) {
			var amount = parseInt(parts[i], 10);
			if (isNaN(amount) || hasUnit) {
				product += parts[i] + " ";
			} else {
				res.Amount = amount;

				var unitMatch = parts[i].match(reUnit);
				if (unitMatch[1] != '')
					res.Unit = unitMatch[1];
				
				hasUnit = true;
			}
		}

		res.Product = product.trim();

		return res;
	}

	function addItem() {
		var item = getProduct();
		if (item == null)
			return;

		sendRequest("POST", null, item, (r) => {
			updateList(r);
		});
		document.getElementById("product").value = "";
	}

	function delItem(id, row, callback) {
		sendRequest("DELETE", "product/"+id, null, callback);
		// sendRequest("DELETE", "product/"+id, null, (r) => {
			// if (callback)
				// callback(row);
		// });
	}

	function sendRequest(verb, path, body, onCompleteCallback) {
		var http = new XMLHttpRequest();
		var url = "http://"+window.location.hostname+":8081/";
		if (path)
			url += path;
			
		http.open(verb, url, true);

		//Send the proper header information along with the request
		http.setRequestHeader("Content-Type", "application/json");
		http.onreadystatechange = function () {//Call a function when the state changes.
			if (http.readyState == 4 && http.status == 200) {
				console.log(http.responseText);
				if (onCompleteCallback)
					 onCompleteCallback(http.responseText);		
			}
		}
		
		if (body)
			http.send(JSON.stringify(body));
		else
			http.send();
	}
	
	function onLoad(){
		document.getElementById("product").addEventListener("keyup", function(event) {
			event.preventDefault();
			if (event.keyCode == 13) {
				document.getElementById("btnAdd").click();
			}
		});
		
		sendRequest('GET', null, null, (r) => {
			updateList(r);
			fillProductDatalist();
		});
	}
