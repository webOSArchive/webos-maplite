/*
    Map lite app for webOS.
    This app depends on a Retro Maps Service, which is hosted by webOS Archive at no cost for what remains of the webOS mobile community.
*/

function MainAssistant() {
    /* this is the creator function for your scene assistant object. It will be passed all the 
       additional parameters (after the scene name) that were passed to pushScene. The reference
       to the scene controller (this.controller) has not be established yet, so any initialization
       that needs the scene controller should be done in the setup function below. */
    this.zoomLevel = 9;
    this.orientation = "unknown";
    this.mapData = null;
}

MainAssistant.prototype.setup = function() {

    //Controls Drawer
    this.controller.setupWidget("drawerControls",
        this.attributes = {
            modelProperty: 'open',
            unstyled: false
        },
        this.model = {
            open: true
        }
    ); 
    //Search bar
    this.controller.setupWidget('txtSearch',
        this.attributes = {
            hintText: 'Enter an address or coordinates...',
            multiline: false,
            focus: false,
            autoFocus: false,
            requiresEnterKey: true,
            focusMode: Mojo.Widget.focusSelectMode
        },
        this.model = {
            value: '',
            disabled: true
        }
    );
    //Jump Locations
    this.controller.setupWidget("listJumpLocations",
        this.attributes = {
            label: $L("Jump To"),
            choices: [
                { label: "Current Location", value: "Current" },
                { label: "North America", value: "NAmerica" },
                { label: "South America", value: "SAmerica" },
                { label: "Europe", value: "Europe" },
                { label: "Africa", value: "Africa" },
                { label: "Asia", value: "Asia" },
                { label: "Australia", value: "Australia" }
            ]
        },
        this.model = {
            value: "Current",
            disabled: false
        }
    );
    //Spinner
	this.controller.setupWidget("spinnerLoad",
        this.attributes = {
            spinnerSize: "small"
        },
        this.model = {
            spinning: true
        }
    ); 
    //Map Scroller
    this.controller.setupWidget("divShowResultImage",
        this.attributes = {
            mode: 'free'
        },
        this.model = { }
    );
    //Menu
    this.appMenuAttributes = { omitDefaultItems: true };
    this.appMenuModel = {
        label: "Settings",
        items: [
            Mojo.Menu.editItem,
            { label: "Map Type", items: [
                { label: "Road", command: 'do-mapTypeRoad', type: "Road" },
                { label: "Aerial", command: 'do-mapTypeAerial', type: "Aerial" },
                { label: "Hybrid", command: 'do-mapTypeHybrid', type: "AerialWithLabels" },
            ]},
            { label: "Preferences", command: 'do-Preferences' },
            { label: "About", command: 'do-myAbout' }
        ]
    };
    this.controller.setupWidget(Mojo.Menu.appMenu, this.appMenuAttributes, this.appMenuModel);
    // Setup command buttons (menu)
    this.cmdMenuAttributes = {
        menuClass: 'no-fade'
    }
    this.cmdMenuModel = {
        visible: true,
        items: [{
                items: [
                    { label: 'Z-', iconPath: 'images/zoomout.png', command: 'do-zoomOut' },
                    { label: 'Z+', iconPath: 'images/zoomin.png', command: 'do-zoomIn' },
                ]
            },
            {
                items: []
            },
            {
                items: [
                    { label: 'Locate', iconPath: 'images/locate.png', command: 'do-getFix' },
                ]
            }
        ]
    };
    this.controller.setupWidget(Mojo.Menu.commandMenu, this.cmdMenuAttributes, this.cmdMenuModel);

    //Check for updates
    if (!appModel.UpdateCheckDone) {
        appModel.UpdateCheckDone = true;
        updaterModel.CheckForUpdate("Map lite", this.handleUpdateResponse.bind(this));
    }
};

MainAssistant.prototype.handleUpdateResponse = function(responseObj) {
    if (responseObj && responseObj.updateFound) {
        updaterModel.PromptUserForUpdate(function(response) {
            if (response)
                updaterModel.InstallUpdate();
        }.bind(this));
    }
}

MainAssistant.prototype.activate = function(event) {
    //Load preferences
    appModel.LoadSettings();
    Mojo.Log.info("settings now: " + JSON.stringify(appModel.AppSettingsCurrent));
    this.zoomLevel = appModel.AppSettingsCurrent["DefaultZoom"];
    serviceModel.UseCustomEndpoint = appModel.AppSettingsCurrent["UseCustomEndpoint"];
    serviceModel.CustomEndpointURL = appModel.AppSettingsCurrent["EndpointURL"];
    if (appModel.AppSettingsCurrent["FirstRun"]) {
        appModel.AppSettingsCurrent["FirstRun"] = false;
        appModel.SaveSettings();
        Mojo.Additions.ShowDialogBox("Welcome to Map Lite!", "This is a lightweight client for a Retro Maps web service, which is powered by Bing Maps and IPInfo.io. You can use the community server for free, until its API limits are hit, or you can enhance your privacy and ease the load by hosting the service yourself.");
    }

    this.selectRoadTypeMenu();

    //figure out our environment
    this.orientation = this.determineOrientation();
    if (Mojo.Environment.DeviceInfo.platformVersionMajor >= 3) {
        this.DeviceType = "TouchPad";
    } else {
        if (window.screen.width == 800 || window.screen.height == 800) {
            this.DeviceType = "Pre3";
        } else if ((window.screen.width == 480 || window.screen.height == 480) && (window.screen.width == 320 || window.screen.height == 320)) {
            this.DeviceType = "Pre";
        } else {
            this.DeviceType = "Tiny";
        }
    }
    Mojo.Log.warn("Starting up in orientation: " + this.orientation + " on device: " + this.DeviceType);

    //handle launch with search query
    if (appModel.LaunchQuery != "") {
        Mojo.Log.info("using launch query: " + appModel.LaunchQuery);
        $("txtSearch").mojo.setValue(decodeURIComponent(appModel.LaunchQuery));
        this.handleSearchClick();
        $("drawerControls").mojo.setOpenState(false);
    } else {
        if (appModel.LastSearchString) {
            $("txtSearch").mojo.setValue(appModel.LastSearchString);
            this.handleSearchClick();
        } else {
            this.hideControlsForResize();
            this.getLocationFix(true);
        }
    }

    //Get ready for input!
    Mojo.Event.listen($("listJumpLocations"), Mojo.Event.propertyChange, this.handleJumpChange.bind(this));
    // Non-Mojo widgets
    this.controller.window.onresize = this.handleOrientationChanged.bind(this);
    Mojo.Event.listen($("divTitle"), Mojo.Event.tap, this.handleTitleTap.bind(this));
    $("btnClear").addEventListener("click", this.handleClearTap.bind(this));
    $("imgMap").addEventListener("click", this.handleMapTap.bind(this));
    this.keyupHandler = this.handleKeyUp.bindAsEventListener(this);
    this.controller.document.addEventListener("keyup", this.keyupHandler, true);
    $("imgWest").addEventListener("click", this.handleDirTap.bind(this));
    $("imgEast").addEventListener("click", this.handleDirTap.bind(this));
    $("imgNorth").addEventListener("click", this.handleDirTap.bind(this));
    $("imgSouth").addEventListener("click", this.handleDirTap.bind(this));
};

/* UI Events */

//Handle menu and button bar commands
MainAssistant.prototype.handleCommand = function(event) {
    if (event.type == Mojo.Event.command) {
        switch (event.command) {
            case 'do-mapTypeRoad':
                appModel.AppSettingsCurrent["DefaultView"] = "Road";
                appModel.SaveSettings();
                this.handleSearchClick();
                this.selectRoadTypeMenu();
                break;
            case 'do-mapTypeAerial':
                appModel.AppSettingsCurrent["DefaultView"] = "Aerial";
                appModel.SaveSettings();
                this.selectRoadTypeMenu();
                this.handleSearchClick();
                break;
            case 'do-mapTypeHybrid':
                appModel.AppSettingsCurrent["DefaultView"] = "AerialWithLabels";
                appModel.SaveSettings();
                this.selectRoadTypeMenu();
                this.handleSearchClick();
                break;
            case 'do-zoomOut':
                this.changeZoom(false)
                break;
            case 'do-zoomIn':
                this.changeZoom(true)
                break;
            case 'do-getFix':
                this.zoomLevel = 11;
                this.getLocationFix();
                break;
            case 'do-Preferences':
                var stageController = Mojo.Controller.stageController;
                stageController.pushScene({ name: "preferences", disableSceneScroller: false });
                break;
            case 'do-myAbout':
                Mojo.Additions.ShowDialogBox("Map Lite - " + Mojo.Controller.appInfo.version, "Map Lite client for webOS. Copyright 2021, Jon Wise. Distributed under an MIT License, and powered by Bing Maps and IPInfo.io.<br>Source code available at: https://github.com/codepoet80/webos-maplite");
                break;
        }
    }
};

//Handles the enter key
MainAssistant.prototype.handleKeyUp = function(event) {

    if (event && Mojo.Char.isEnterKey(event.keyCode)) {
        if (event.srcElement.parentElement.id == "txtSearch") {
            this.handleSearchClick(event);
        }
    }
};

//Handle mojo button taps
MainAssistant.prototype.handleSearchClick = function(event) {

    this.disableUI();
    //figure out what was requested
    var stageController = Mojo.Controller.getAppController().getActiveStageController();
    if (stageController) {
        this.controller = stageController.activeScene();
        var searchRequest = $("txtSearch").mojo.getValue();
        Mojo.Log.info("Processing search request: " + searchRequest);
        if (searchRequest && searchRequest != "") {
            appModel.LastSearchString = searchRequest;
            this.searchMapData(searchRequest);
        } else {
            this.enableUI();
        }
    }
}

MainAssistant.prototype.handleJumpChange = function(event) {
    Mojo.Log.info("User wants to jump to: " + event.value);
    var newSearchResult = null;
    switch (event.value) {
        case 'NAmerica':
            newSearchResult = "48.368748,-99.996078";
            this.zoomLevel = 5;
            changed = true;
            break;
        case 'SAmerica':
            newSearchResult = "-15.5961100,-56.0966700";
            this.zoomLevel = 5;
            changed = true;
            break;
        case 'Europe':
            newSearchResult = "55.4879,28.7856";
            this.zoomLevel = 5;
            changed = true;
            break;
        case 'Africa':
            newSearchResult = "2.3780,16.0630";
            this.zoomLevel = 4;
            changed = true;
            break;
        case 'Asia':
            newSearchResult = "44.402393,86.154785";
            this.zoomLevel = 4;
            changed = true;
            break;
        case 'Australia':
            newSearchResult = "-24.25,133.416667";
            this.zoomLevel = 6;
            changed = true;
            break;
    }
    if (newSearchResult != null) {
        $("txtSearch").mojo.setValue(newSearchResult);
        this.handleSearchClick();
    }
}

//Handle tap of title bar
MainAssistant.prototype.handleTitleTap = function(toggleState) {
    if (typeof toggleState === 'undefined') {
        $("drawerControls").mojo.setOpenState(toggleState);
    } else {
        $("drawerControls").mojo.toggleState();
    }
    this.hideControlsForResize();
    this.controller.window.setTimeout(this.calculateControlsPosition.bind(this), 900);
}

//Handle clear button tap
MainAssistant.prototype.handleClearTap = function() {

    //Clear the text box
    $("txtSearch").mojo.setValue("");

    //Uncheck all items in list
    var listWidgetSetup = $WidgetSetup("searchResultsList");
    for (var i = 0; i < listWidgetSetup.model.items.length; i++) {
        listWidgetSetup.model.items[i].selectedState = false;
    }
    //Hide List
    $("showResultsList").style.display = "none";

    this.enableUI();
    $("txtSearch").mojo.focus();
}

//Handle direction arrow tap
MainAssistant.prototype.handleDirTap = function(event) {
    if (event.srcElement.id.indexOf("img") != -1) {
        var direction = event.srcElement.id.replace("img", "");
        Mojo.Log.info("You tapped: " + event.srcElement.id + " so I should pan " + direction.toLowerCase());
        this.panMap(direction.toLowerCase());
    }
}

//Handle map taps
MainAssistant.prototype.handleMapTap = function(event) {

    var xSegments = Math.round($("imgMap").width / 3);
    var xPos = -2;
    for (var xCheck=0; xCheck < $("imgMap").width; xCheck=xCheck+xSegments)
    {
        if (event.x > xCheck)
            xPos++;
    }
    var ySegments = Math.round($("imgMap").height / 3);
    var yPos = -2;
    for (var yCheck=0; yCheck < $("imgMap").height; yCheck=yCheck+ySegments)
    {
        if (event.y > yCheck)
            yPos++;
    }

    Mojo.Log.info("You tapped X: " + event.x + ", Y: " + event.y + " so I calculated your tap segment as xpos " + xPos + ", ypos " + yPos);
    if (xPos > 0 && yPos == 0) { Mojo.Log.info("I should move east on the longitude"); this.panMap("east"); }
    if (xPos < 0 && yPos == 0) { Mojo.Log.info("I should move west on the longitude"); this.panMap("west"); }
    if (yPos > 0 && xPos == 0) { Mojo.Log.info("I should move south on the latitude"); this.panMap("south"); }
    if (yPos < 0 && xPos == 0) { Mojo.Log.info("I should move north on the latitude"); this.panMap("north"); }
}

/* Map Stuff */

//Try to find the location
//TODO: Should also try GPS Fix
MainAssistant.prototype.getLocationFix = function(hideDrawer) {
    Mojo.Log.info("Attempting to get location fix...");
    serviceModel.DoIPLocationFix(function(response) {
        if (response != null && response != "") {
            Mojo.Log.info("Got IP Fix response: " + response);
            var responseObj = JSON.parse(response);
            if (responseObj.status == "error") {
                Mojo.Log.error("Error message from server while trying IP GeoFix.");
                Mojo.Additions.ShowDialogBox("Server Error", "The server responded to the geolocation request with: " + responseObj.msg.replace("ERROR: ", ""));
            } else {
                if (responseObj.location && responseObj.location != "") {  //If we got a good looking response, remember it, and update the UI
                    appModel.LastSearchResult = responseObj.location;
                    Mojo.Additions.DisableWidget("txtSearch", false);
                    $("txtSearch").mojo.setValue(responseObj.location);
                    this.handleSearchClick(hideDrawer);
                    if (hideDrawer) {
                        $("drawerControls").mojo.setOpenState(false);
                    }
                } else {
                    Mojo.Log.warn("IP GeoFix response was empty. Either there was no matching results, or there were server or connectivity problems.");
                    Mojo.Additions.ShowDialogBox("Geolocation Error", "The server could not locate this client.");
                }
            }
         }
    }.bind(this));
}

//Send a search request to Maps Service
MainAssistant.prototype.searchMapData = function(searchRequest) {
    Mojo.Log.info("Search requested: " + searchRequest);
    this.SearchValue = searchRequest;
    Mojo.Log.info("- Map type: " + appModel.AppSettingsCurrent["DefaultView"]);
    var mapSize = window.innerWidth + "," + window.innerHeight;
    Mojo.Log.info("- Map size: " + mapSize);

    serviceModel.DoMapDataRequest(searchRequest, appModel.AppSettingsCurrent["DefaultView"], mapSize, false, this.zoomLevel, function(response) {
        Mojo.Log.info("ready to process search results: " + response);
        if (response != null && response != "") {
            var responseObj = JSON.parse(response);
            if (responseObj.status == "error") {
                Mojo.Log.error("Error message from server while searching for map data: " + responseObj.msg);
                Mojo.Additions.ShowDialogBox("Server Error", "The server responded to the search request with: " + responseObj.msg.replace("ERROR: ", ""));
            } else {
                if (responseObj.latitude && responseObj.latitude && responseObj.img) { //If we got a good looking response, remember it, and update the UI
                    Mojo.Log.info("Got map data!");
                    this.updateMapImage(responseObj);
                } else {
                    Mojo.Log.warn("Search results were empty. Either there was no matching result, or there were server or connectivity problems.");
                    Mojo.Additions.ShowDialogBox("No results", "The server did not report any matches for the search.");
                    this.updateMapImage();
                }
            }
        } else {
            Mojo.Log.error("No usable response from server while searching for Map Data: " + response);
            Mojo.Additions.ShowDialogBox("Server Error", "The server did not answer with a usable response to the search request. Check network connectivity and/or self-host settings.");
        }
        this.enableUI();
    }.bind(this));
}

//Update the UI with search results from Search Request
MainAssistant.prototype.updateMapImage = function(mapData) {
    if (mapData && mapData.img) {
        this.mapData = mapData;
        Mojo.Log.info("Updating map image with: " + mapData.img);
        $("imgMap").src = mapData.img;
    }
    if ($("drawerControls").mojo.getOpenState()) {
        this.hideControlsForResize();
    }
    this.controller.window.setTimeout(this.calculateControlsPosition.bind(this), 900);
}

MainAssistant.prototype.changeZoom = function(up) {
    if (up) { //increase zoom
        if (this.zoomLevel < 20)
            this.zoomLevel++;
    } else { //decrease zoom
        if (this.zoomLevel > 0)
            this.zoomLevel--;
    }
    this.handleSearchClick();
}

MainAssistant.prototype.panMap = function(panDir) {
    //TODO: This doesn't work in Australia
    currentLong = this.mapData.longitude;
    currentLat = this.mapData.latitude;
    //if (this.currentLat != 0) // && this.mapscale < 20)
    {
        switch (panDir) {
            case "west":
                {
                    currentLong = this.mapData.longitude * 1 - (100 / Math.pow(2, this.zoomLevel));
                    if (currentLong < -180)
                        currentLong = currentLong * 1 + 180;
                }
                break;
            case "east":
                {
                    currentLong = this.mapData.longitude * 1 + (100 / Math.pow(2, this.zoomLevel));
                    if (currentLong > 180)
                        currentLong = currentLong * 1 - 180;
                }
                break;
            case "north":
                {
                    currentLat = this.mapData.latitude * 1 + (100 / Math.pow(2, this.zoomLevel));
                    if (currentLat > (90 - (100 / Math.pow(2, this.zoomLevel))))
                        currentLat = 90 - (100 / Math.pow(2, this.zoomLevel));
                    //if (this.currentLat > 90)
                    //this.currentLat=90;
                }
                break;
            case "south":
                {
                    currentLat = this.mapData.latitude * 1 - (100 / Math.pow(2, this.zoomLevel));
                    if (currentLat < (-90 + (100 / Math.pow(2, this.zoomLevel))))
                        currentLat = -90 + (100 / Math.pow(2, this.zoomLevel)); //-90;
                }
                break;
        }
        if (currentLat != this.mapData.latitude || currentLong != this.mapData.longitude) {
            Mojo.Log.info("** Panning Map to latitude: " + currentLat + ", longitude: " + currentLong);
            $("txtSearch").mojo.setValue(currentLat + "," + currentLong);
            this.handleSearchClick();
        }
    }
}

/* Screen Stuff */
MainAssistant.prototype.handleOrientationChanged = function(event) {
    this.handleSearchClick();
    this.hideControlsForResize();
    this.controller.window.setTimeout(this.calculateControlsPosition.bind(this), 900);
}

MainAssistant.prototype.determineOrientation = function() {
    if (window.innerHeight > window.innerWidth)
        return "portrait";
    else
        return "landscape";
}

MainAssistant.prototype.calculateControlsPosition = function() {
    Mojo.Log.warn("Resizing viewer in orientation: " + this.orientation);

    var chromeHeight = document.getElementById("divTitle").offsetHeight;
    chromeHeight += document.getElementById("drawerControls").offsetHeight;
    Mojo.Log.info("chrome height: " + chromeHeight);
    var div = document.getElementById("divShowResultImage");

    var newHeight = window.innerHeight;
    var newWidth = window.innerWidth;
    var useBottom = newHeight - 35;

    div.style.width = newWidth + "px";
    div.style.height = newHeight + "px;"
    Mojo.Log.info("Viewer now: width " + newWidth + ", height " + newHeight);

    $('imgNorth').style.top = chromeHeight + "px";
    $('imgNorth').style.left = ((newWidth / 2) - 40) + "px";
    $('imgSouth').style.left = $('imgNorth').style.left;
    $('imgSouth').style.top = useBottom + "px";
    $('imgWest').style.top = ((newHeight / 2) + (chromeHeight - 80)) + "px";
    $('imgEast').style.top = $('imgWest').style.top;

    $('imgNorth').style.visibility = "visible";
    $('imgSouth').style.visibility = "visible";
    $('imgWest').style.visibility = "visible";
    $('imgEast').style.visibility = "visible";

    $("spinnerLoad").mojo.stop();
}

MainAssistant.prototype.hideControlsForResize = function() {
    $('imgNorth').style.visibility = "hidden";
    $('imgSouth').style.visibility = "hidden";
    $('imgWest').style.visibility = "hidden";
    $('imgEast').style.visibility = "hidden";
}

MainAssistant.prototype.disableUI = function(statusValue) {
    $("spinnerLoad").mojo.start();
}

MainAssistant.prototype.enableUI = function() {

}

MainAssistant.prototype.selectRoadTypeMenu = function() {
    Mojo.Log.info("Current menu item: " + JSON.stringify(this.appMenuModel.items[1]));
    for (var i=0;i<this.appMenuModel.items[1].items.length;i++) {
        Mojo.Log.info("Menu item found: " + this.appMenuModel.items[1].items[i].type + " ?= " + appModel.AppSettingsCurrent["DefaultView"]);
        if (this.appMenuModel.items[1].items[i].type == appModel.AppSettingsCurrent["DefaultView"]) {
            this.appMenuModel.items[1].items[i].chosen = true;
        } else {
            this.appMenuModel.items[1].items[i].chosen = false;
        }
    }
    this.controller.modelChanged(this.appMenuModel);
}

/* End of Life Stuff */
MainAssistant.prototype.deactivate = function(event) {
    /* remove any event handlers you added in activate and do any other cleanup that should happen before
       this scene is popped or another scene is pushed on top */
    Mojo.Event.stopListening($("listJumpLocations"), Mojo.Event.propertyChange, this.handleJumpChange);
    this.controller.window.onresize = null;
    Mojo.Event.stopListening($("divTitle"), Mojo.Event.tap, this.handleTitleTap);
    $("btnClear").removeEventListener("click", this.handleClearTap);
    $("imgMap").removeEventListener("click", this.handleMapTap);
    this.controller.document.removeEventListener("keyup", this.keyupHandler);
    $("imgWest").removeEventListener("click", this.handleDirTap);
    $("imgEast").removeEventListener("click", this.handleDirTap);
    $("imgNorth").removeEventListener("click", this.handleDirTap);
    $("imgSouth").removeEventListener("click", this.handleDirTap);
};

MainAssistant.prototype.cleanup = function(event) {
    /* this function should do any cleanup needed before the scene is destroyed as 
       a result of being popped off the scene stack */
};