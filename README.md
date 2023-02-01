# VuLoader
A repository contains a helpful Vuforia Studio script, giving you the ability to load Shader, Extensions, Libs and create Widget on the fly via a JS api

## Getting Started
First of we need to prepare our Vuforia Studio Project, to be able to use this script.

### Setup Extensions folder + add VuLoader.js
I highly recommend to create a separate "Extensions" folder in the default Uploaded folder in resources.
If you never create a sub directory in Studio before, do the following:
- open a new Windows Explorer/ Finder window to browse your files
- go to Documents/VuforiaStudio/Projects/**YourProjectName**/src/resources/Uploaded (Uploaded folder is only present, if you added at least one file to the resources. Otherwise you need to create it manually!)
- Create the new "Extensions" folder in it
- Create a VuLoader folder and copy the VuLoader.js into it OR if you manage your experience via Git use [submodule](https://git-scm.com/book/en/v2/Git-Tools-Submodules): `git submodule add https://github.com/sbruegel/VuLoader.git src/phone/resources/Uploaded/Extensions/VuLoader`

### Load script with callback

Add following code into the view where you want to use it.
The `onload` function is the callback, so we are sure the script is loaded before we use any functionality
``` JS
// Add the Extension loader to html head
var scriptTag = document.createElement('script');
scriptTag.src = "app/resources/Uploaded/Extensions/VuLoader/VuLoader.js";
scriptTag.onload = initLoadFunction; // Here we will add a function which will define what we want to load exactly
document.head.appendChild(scriptTag);
```

### Working with callback function

After loading the script, we want to execute some function like loading custom widgets or shader so we can later use them to init Widgets. In the example above we named the function `initLoadFunction`. So here an example how such a function can look like:<br>
*Note: Vuforia uses jslint to warn you by syntax issues or bugs. It also warn that async functions are only supported in es8 and above. However this is working fine on all devices and can be ignored. It is possible to tell JS Lint to use es8, if you add `/* jslint esversion: 8 */` to the top of the home.js file*

``` JS
async function initLoadFunction() {

  await VuLoader.getScript('app/resources/Uploaded/Extensions/html2canvas/html2canvas.min.js');
  await VuLoader.getScript('app/resources/Uploaded/Extensions/ButtonPages/js/btnPages.js');
  await VuLoader.loadShader('flow_onedir_scale');
 
  // Tell user everything has loaded!
  //$scope.view.wdg['spinner-1'].visible=false;
  // Emit a custom event to tell our application when the default libs are loaded and we can start the session!
  $scope.$emit("vuloaderready");
}
```

### Create Widgets after Init is ready

So now everything is loaded and ready we can start using the Widget Factory to create Widgets on the fly via JS

``` JS
$scope.$on("vuloaderready",function(){
  VuLoader.widgetFactory.addWidget({
      originalWidget: "twx-dt-model",
      id: "model-1",
      src: "app/resources/Uploaded/example.pvz",
      y:"0.1",
      z:"0.2",
      events:[{name:"modelLoaded", value: "someExample()"}]
    })
}) 
```


## API

The script creates, if it is loaded, an global variable called `VuLoader`. Here you find all exposed function you can later use.
It is similar like THREE.js integration of Studio!

### getFile(url)

- **url**: just the URL string to the script starting normally with app/resources...

This asynchronous function helps you to load all kind of file and provides a callback.

**Example**:

``` JS
VuLoader.getFile("app/resources/Uploaded/Interfaces/main-menu.html").then(content=>$scope.add2dRuntimeWdg(content))
```

This will load a plain HTML interface and add it to the 2D Overlay

### getScript(url)

- **url**: just the URL string to the script starting normally with app/resources...

This asynchronous function will give you a wrapper to load 3rd party JavaScript libs and provides a callback. 
Means you don't have to use every time the same code like provided in preparation steps to load the VuLoader
It additionally been used by `loadExtension`

**Example**:

``` JS
VuLoader.getScript('app/resources/Uploaded/Extensions/html2canvas/html2canvas.min.js');
```

A script i used to draw HTML stuff, of the Webview of the Experience, on an canvas. This canvas can easily exported to a base64 encoded image, which i can later attach as 3D Image texture.
Long story short: This allows you to show 2D Interface (HTML/CSS code) on HoloLens devices. Down side is of course that you can't interact with it. 

### loadExtension(name, dependencies, path)

- **name**: Name of the extension this is used to find the right path of data (VuLoader is looking at ..Uploaded/Extensions/**name**/..)
- **dependencies**: a JSON defining all dependencies, like files (array), angularModules (array), shader (array), widget (JSON) which contains the widgetTag (string), defaults (JSON of properties) and runtimeTemplate (function)
- **path**: an custom path where to search at (default /Uploaded/Extension)

This asynchronous function will inject custom Widgets/Extensions to the `widgetFactory` it allows you nearly the same patterns like index.js / design.js of an custom Extension.
You can load dependencies (can detect if libs/files/shaders are already loaded) and register the widgets in the factory

``` JS
// Here the magic happens load and define a new extension (widget) and its libs you have placed at /Uploaded/Extensions/YOUR-extension
  let shaderNavigator = ['navpinger','navfoggedLit']
  if(!VuLoader.runningOnHololens)
    shaderNavigator.push('navfogged');
  VuLoader.loadExtension("Navigator",{
    files:['js/matrix.js', 'js/navigationhelper.js', 'js/navigator-ng.js'],
    angularModules:['navigator-ng'],
    shader: shaderNavigator,
    widget: { 
      widgetTag: 'twx-navigator',
      defaults: {
        auto: true,
        extent: 0.45,
        floor: 0,
        tunnelSrc: '',
        tunnelColor: '1,1,0',
        device: '',
        head: true,
        feet: true,
        feetColor: "0,1,0",
        feetSrc: 'app/resources/Uploaded/Extensions/Navigator/images/navfeet.png',
        steps: 30,
        cutoff: 0.5,
        poi: 0,
        services: ['hide','show','capture']
      },
      runtimeTemplate: function(props) {
        return `<ng-navigator id-field="${props.id}" isholo-field="${VuLoader.runningOnHololens}"
                              step-field="{{me.steps}}" shader-field="me.shader" extent-field="{{me.extent}}"
                              visible-field="{{me.visible}}" auto-field="{{me.auto}}"
                              cutoff-field="{{me.cutoff}}" floor-field="{{me.floor}}"
                              poidata-field="me.poidata" poi-field="{{me.poi}}" value-field="me.value"
                              head-field="{{me.head}}" feet-field="{{me.feet}}" feetsrc-field="{{me.feetSrc}}"
                              ${VuLoader.runningOnHololens?'device-field={{me.holotarget}}':'device-field={{me.device}}'} tunnelcolor-field="{{me.tunnelColor}}"
                              feetcolor-field="{{me.feetColor}}" delegate-field="delegate"></ng-navigator>`
      }
    }
  }).then(()=> {
    console.log('Navigator loaded')
    // if you don't like to use await then use then :)
    // After we load all entities for the extension add the widget to our scene!
    VuLoader.widgetFactory.addWidget({
      originalWidget: "twx-navigator",
      id: "nav-1",
      events:[{name: "arrived",value:"arrivedAtSensor();"}]
    });
    console.log('Navigator added');
  });
```

Here i loaded the Navigator Widget form [Octo Widgets](https://github.com/steveghee/OCTO_Studio_extensions) and created one as soon the extension is loading!

### loadShader(shaderName, vertexHl, fragmentHl, vertexGl, fragmentGl)

*note: this function is overloaded! If you just pass the first parameter the function is loading shader files like shaderName.vertex.glsl etc. which needs to be present at `Uploaded/Extensions/Shader` folder instead of need all strings*
- **shaderName**: name and identifier of the shader on the one hand it is what we use later on widget properties called `shader` on the other hand (if just this parameter is passed) it is the name of the files the function is looking for
- **vertexHL**: string of the hlsl vertex shader
- **fragmentHL**: string of the hlsl fragment+pixel shader
- **vertexHL**: string of the glsl vertex shader
- **fragmentHL**: string of the glsl fragment shader

This asynchronous function can load Shaders from string or resources and will inject them. The function expected that both the glsl and the hlsl version of the shader exists. (for mobile devices or HoloLens)
The shader files needs to be present as shaderName.shaderType.shaderLang (testShader.fragment.hlsl), following the Vuforia Studio way of definition.
It additionally been used by `loadExtension`, if an extension has defined them in their dependencies.

**Example**:

``` JS
VuLoader.loadShader('flow_onedir_scale');
```

### widgetFactory
This is a sub class init by VuLoader itself. This class is registering know widgets and holds the logic to add and create Widget Runtime templates on the fly.
If you want it "complies" the Widget for you.
The most important functions are the following:

#### addWidget(widgetDef, insertPos)

- **widgetDef**: JSON definition of the Widget you want to add (the originalWidget and id are mandatory, all other js prop names are optional)
- **insertPos**: the HTML insert position where the elements should be added (default 3D Container, but useful if you want to add later on widgets to groups or panels)

This function will inject "compiled" 3D Widgets to the HTML DOM so they get added into the Scene.

``` JS
VuLoader.widgetFactory.addWidget({
    originalWidget: "twx-dt-model",
    id: "model-1",
    src: "app/resources/Uploaded/example.pvz",
    y:"0.1",
    z:"0.2",
    events:[{name:"modelLoaded", value: "someExample()"}]
})
```

To use init Panels with widgets inside you can use the `children` key in JSON. Like:<br>
*Note: the visibility also supports `-1` to use the visibility from parent elements, like here from a panel*
``` JS
VuLoader.widgetFactory.addWidget({
  originalWidget: "twx-dt-3dpanel",
  id: "onboard-pnl",
  tagalong: true,
  width: 0.3,
  height: 0.3,
  children: [{
      originalWidget: "twx-dt-image",
      width: 0.3,
      height:  0.3,
      z: -0.005,
      id: "onboard-content-1",
      src: canvas.toDataURL(),// This works only because my dyn injector fix an issue that 3D Images not trust srcs
      visible: -1
    },{
      originalWidget: "twx-dt-3dbutton",
      text: "Continue",
      color: panelMainColor,
      fontColor: "rgba(255,255,255,1);",
      width: 0.3,
      height:  0.04,
      z: -0.008,
      y: -0.17,
      id: "onboard-continue-btn",
      visible: -1,
      events: [{name:"click", value:"addMainMenu(); view.wdg['onboard-pnl'].visible=false"}]
    }]
});
```

If you like to use Leader Lines, the approach is very similar, but it uses `leaderlines` key instead!<br>
It will directly create them as `twx-dt-3dleaderline` so no `originalWidget` parameter is needed in comparison to children.

``` JS
VuLoader.widgetFactory.addWidget({
  originalWidget: "twx-dt-sensor",
  id: "3DGauge-1",
  src: "app/resources/Default/vu_alert1.svg",
  y: + i / 2,
  billboard: false,
  events:[{name:"click", value: "someExample(widgetId)"}],
  leaderlines: [{
    id: "3DLeaderline-1",
    x: 1,
    y: 0.3,
    z: 0.1
  }]
})
```