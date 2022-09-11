/*
In the app assistant, we setup some app-wide global objects and handle different kinds of launches, creating and delegating to the main stage
*/
var appModel = null;
var updaterModel = null;
var serviceModel = null;

function AppAssistant() {
    appModel = new AppModel();
    updaterModel = new UpdaterModel();
    serviceModel = new ServiceModel();
    Mojo.Additions = Additions;
}

//This function will handle relaunching the app when an alarm goes off(see the device/alarm scene)
AppAssistant.prototype.handleLaunch = function(params) {
    Mojo.Log.info("Map Lite is Launching! Launch params: " + JSON.stringify(params));
    
    //load preferences
    appModel.LoadSettings();
    Mojo.Log.info("settings now: " + JSON.stringify(appModel.AppSettingsCurrent));

    //get the proxy for the stage in the event it already exists (eg: app is currently open)
    var mainStage = this.controller.getStageProxy("");

    //if there was a search query, load with that
    if (params && params["query"] != undefined) {
        appModel.LaunchQuery = decodeURI(params["query"]);
        Mojo.Log.info("Launch query was: " + appModel.LaunchQuery);
    }

    //if the stage already exists then just bring it into focus
    if (mainStage) {
        var stageController = this.controller.getStageController("");
        stageController.activate();
    }
    return;
};