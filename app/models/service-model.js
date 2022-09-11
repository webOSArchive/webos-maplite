/*
Maps Service Model - Mojo
 Version 1.0
 Created: 2021-2022
 Author: Jonathan Wise
 License: MIT
 Description: A model to interact with Retro Map service within a Mojo app.
*/

var ServiceModel = function() {
    this.urlBase = "http://maps.webosarchive.com/";
    this.supportedMapTypes = ["Road", "Aerial", "AerialWithLabels"]
};

//Properties
ServiceModel.prototype.UseCustomEndpoint = false;
ServiceModel.prototype.CustomEndpointURL = "";

ServiceModel.prototype.buildURL = function(actionType) {
    var urlBase = this.urlBase;
    if (this.UseCustomEndpoint == true && this.CustomEndpointURL != "") {
        urlBase = this.CustomEndpointURL;
    }
    //Make sure we don't end up with double slashes in the built URL if there's a custom endpoint
    var urlTest = urlBase.split("://");
    if (urlTest[urlTest.length - 1].indexOf("/") != -1) {
        urlBase = urlBase.substring(0, urlBase.length - 1);
    }
    var path = urlBase + "/" + actionType + ".php";
    return path;
}

//HTTP request to search for location based on IP address
ServiceModel.prototype.DoIPLocationFix = function(callback) {
    this.retVal = "";
    Mojo.Log.info("Requesting location fix from server!");
    if (callback)
        callback = callback.bind(this);

    var theQuery = this.buildURL("getlocation-byip");
    Mojo.Log.info("Searching with query: " + theQuery);
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.open("GET", theQuery);
    xmlhttp.setRequestHeader("Client-Id", this.getCurrentClientKey());
    xmlhttp.send();
    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == XMLHttpRequest.DONE) {
            if (callback)
                callback(xmlhttp.responseText);
        }
    }.bind(this);
}

//HTTP request to search maps
ServiceModel.prototype.DoMapDataRequest = function(search, mapType, mapSize, pushPin, zoomLevel, callback) {
    this.retVal = "";
    Mojo.Log.info("Searching with search: " + search);
    if (callback)
        callback = callback.bind(this);

    var theQuery = this.buildURL("getmapdata-bylocation") + "?q=" + encodeURI(search);
    if (mapType && mapType != "" && this.supportedMapTypes.indexOf(mapType) != -1)
        theQuery += "&mapType=" + mapType;
    else
        Mojo.Log.warn("Invalid map type requested, " + mapType + ". Use only " + this.supportedMapTypes);
    if (mapSize && mapSize != "" && mapSize.indexOf(",") != -1)
        theQuery += "&mapSize=" + mapSize;
    else
        Mojo.Log.warn("Invalid map size requested, " + mapSize + ". Use format like: 800,600");
    //TODO: Make pushPin configurable
    //theQuery += "&pushPin=false";
    if (zoomLevel && zoomLevel != "" && zoomLevel >= 1 && zoomLevel <=20)
        theQuery += "&zoomLevel=" + zoomLevel;
    else
        Mojo.Log.warn("Invalid map zoom level requested, " + zoomLevel + ". Use values between 1 and 20");

    Mojo.Log.info("Searching with query: " + theQuery);
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.open("GET", theQuery);
    xmlhttp.setRequestHeader("Client-Id", this.getCurrentClientKey());
    xmlhttp.send();
    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == XMLHttpRequest.DONE) {
            if (callback)
                callback(xmlhttp.responseText);
        }
    }.bind(this);
}

ServiceModel.prototype.base64UrlEncode = function(url) {
    url = btoa(url);
    // Convert Base64 to Base64URL by replacing “+” with “-” and “/” with “_”
    url = url.replace(/\+/g, '-');
    url = url.replace(/\//g, "_");
    return url;
}

ServiceModel.prototype.getCurrentClientKey = function() {
    var retVal = atob(appKeys['clientKey']);
    if (this.UseCustomClientAPIKey) {
        retVal = this.CustomClientAPIKey;
        Mojo.Log.info("Using custom API key: " + retVal);
    }
    return retVal;
}