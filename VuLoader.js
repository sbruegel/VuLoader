(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.VuLoader = factory());
})(this, (function () {
  'use strict';

  class VuLoader {
      constructor(runningOnHololens, rootPath) {
        this.$injector = angular.element(document.querySelector('[ctrl-name$="_TwxViewController"]')).injector();
        this.renderer = this.$injector.get('tml3dRenderer')
        this.$http = angular.element(document.body).injector().get('$http');

        this.runningOnHololens = this.setRunningOnHololens();
        this.extensionPath    = "app/resources/Uploaded/Extensions/";
        this.dynAngularLoader = new DynamicAngularModuleLoader();
        this.widgetFactory    = new WidgetRegister(this.runningOnHololens);
        // To not re define the running on HL function again store output in module
         
        //this.rootPath = rootPath;
        // Save all loaded extensions into an array
        this.loadedShaders = [];

        //Not in use
        this.loadedExtensions = [];
        this.loadedAngularModules = [];
        // Save current scope to better emit events 
        // TODO: Clarify if this is really useful
        //this.scope = angular.element(document.querySelector('[ctrl-name="Home_TwxViewController"]')).scope();         
      }

      //Check if we run at Hololens or on tablet
      setRunningOnHololens() {
        // in preview there is no window.cordova
        // if you want to the app on preview, modify the below with:
        // platformId: windows
        // preview for hololens
        if (typeof window.cordova == 'undefined') {
          window.cordova = {
            platformId: 'ios',
          };
          if(twx.app.isPreview()) {
            window.vuforia=this.renderer; //Some new bad coded widgets check if cordova is a present var and inject the different renderer itself
          }
        }
        // this will also match thingview on windows, but whatever.
        return window.cordova.platformId == 'windows';
      }

      // This will load additional JS libs and use the dynamicAngularModuleLoader for Widget Extension
      loadExtension(name, dependencies, path = this.extensionPath) {
        let allFileDep = [];
        // need to store correct this for later use it in Promise all because of missing bind method
        let self = this;
        return new Promise(function(resolve, reject) {
          
          if(typeof dependencies.files != "undefined") {
            dependencies.files.forEach(file => {
              allFileDep.push(self.getScript(path+name+'/'+file));
            })
          }
          // Edge Case for example for navigator it may be the case that we need to load shaders
          if(typeof dependencies.shader != "undefined") {
            dependencies.shader.forEach(shader => {
              allFileDep.push(self.loadShader(shader,name+"/shader/"));
            });
          }

          if(typeof dependencies.widget != "undefined") {
            self.widgetFactory.registerWidget(dependencies.widget.widgetTag,dependencies.widget.runtimeTemplate,dependencies.widget.defaults)
          }

          Promise.all( allFileDep ).then( function () {
            if(typeof dependencies.angularModules != "undefined") {
              dependencies.angularModules.forEach(module => {
                // We do not want to import angularModules twice! So check if it is already injected
                if(!self.dynAngularLoader._rootApplicationModule.requires.includes(module)) {
                  self.dynAngularLoader.loadModule(module);
                  self.loadedExtensions.push(name);
                }
                else
                  console.warn("The Angular Module " + module + " was already loaded and therefore skipped. May be it was loaded by another extension!")
                resolve(name);
              })
            }
          })
        });
      }
  
      loadShader(shaderName, vertexHl = false, fragmentHl, vertexGl, fragmentGl) {
        let allFileDep = [];
        // need to store correct this for later use it in Promise all because of missing bind method
        let self = this;
        if(arguments.length <= 2) {
          var loadFile = true;
        }
        return new Promise(function(resolve, reject) {
          // Check that we do not load shaders multiple times!
          if(document.querySelector('script[name="'+shaderName+'"][type="x-shader/x-fragment"]') || self.loadedShaders.includes(shaderName)) {
            console.warn("The file " + shaderName + " was already loaded and therefore skipped. May be it was loaded by another extension!")
            resolve(shaderName);
          }
          else {
            // Register Shader
            self.loadedShaders.push(shaderName);
            // Default load shader from shader files (glsl or hlsl)
            if(loadFile) {
              let shaderLang = (self.runningOnHololens && !twx.app.isPreview()) ? ".hlsl" : ".glsl";
              // In some edge cases a extension may be come with own shader definitions so we take a look at shader folder inside the extension instead
              // Looking a bit wired but we can't really overload the function so we need to reuse vertexHL :/ 
              let shaderPath = self.extensionPath + (vertexHl ? vertexHl : "Shader/") + shaderName;
              console.log(shaderPath)
              // To later access the respond in Promise.all we need to return the respond of the loaded file
              allFileDep.push(self.getFile(shaderPath+".vs"+shaderLang).then(respond => {return respond}))
              allFileDep.push(self.getFile(shaderPath+".fs"+shaderLang).then(respond => {return respond}))

              Promise.all( allFileDep ).then( function (shader) {
                self.createShaderScripts(shaderName,shader[0], shader[1]);
                resolve(shaderName)
              });
            }
            // "Overloaded" function if more is provided add shader via string instead of file based
            else {
              if(self.runningOnHololens)
                self.createShaderScripts(shaderName, vertexHl, fragmentHl);
              else
                self.createShaderScripts(shaderName, vertexGl, fragmentGl);
              resolve(shaderName);
            }
          }
        });
      }

      // Will add shader as script with given inputs see loadShader functions
      createShaderScripts(shaderName, vertex, fragment) {
        /*
        // This only works if shader are injected before the twx-dt-view element is loaded
        this.createDefaultScript(vertex,    "x-shader/x-vertex",    shaderName);
        this.createDefaultScript(fragment,  "x-shader/x-fragment",  shaderName);
        */
        this.renderer.setShader(shaderName, vertex, fragment);
      }

      // Create a script from string input
      // Used by load shader API to create shader script from native shader files
      createDefaultScript(text, type = "text/javascript", name = false) {
        let script = document.createElement("script")
        script.type = type;

        if(name)
          script.setAttribute("name", name);

        script.innerHTML = text;
        
        document.body.appendChild(script);
      }

      // Use REST to get files (like shader files) and create a promise we can work with later
      getFile(url) {
        let self = this;
        return new Promise(function(resolve, reject) {
          // Do the usual XHR stuff
          self.$http.get(url)
          .success(function (data) {
            //console.log(data)
            resolve(data);
          })
          .error(function (error) {
            console.error('Error loading file: ', error);
            reject(new Error('Error loading file'));
          });
          /*var req = new XMLHttpRequest();
          req.open('GET', url);
          
          req.onload = function() {
            // This is called even on 404 etc. so check the status
            if (req.status == 200) {
              // Resolve the promise with the response text
              resolve(req.response);
            }
            else {
              // Otherwise reject with the status text
              // which will hopefully be a meaningful error
              reject(Error(req.statusText));
            }
          };
      
          // Handle network errors
          req.onerror = function() {
            reject(Error("Network Error"));
          };
          // Make the request
          req.send();*/
        });
      }

      // If the files is a plain js file it is more useful to load it via src attribute of a script instead
      // This makes it also more easy to check if we already load a js file or not
      getScript(url) {
        let self = this;
        /*return new Promise(function(resolve, reject) {
          self.$http.get(url)
          .success(function (data) {
            let libName = url.substring(url.lastIndexOf("/")+1,url.length);
            console.log(url);
            if(!document.querySelector('script[name$="'+libName+'"]')) {
          console.log("success load "+libName);
              self.createDefaultScript(data, undefined, libName)
              resolve(libName);
            }
            else {
              console.warn("The file " + libName + " was already loaded and therefore skipped. May be it was loaded by another extension!")
              reject(new Error("The file " + libName + " was already loaded and therefore skipped. May be it was loaded by another extension!"));
            }
            
          })
          .error(function (error) {
            console.error('Error loading file: ', error);
            reject(new Error('Error loading file'));
          });
        });*/
        return new Promise(function(resolve, reject) {
          let libName = url.substring(url.lastIndexOf("/")+1,url.length);
          if(!document.querySelector('script[name$="'+libName+'"]')) {
            let scriptTag = document.createElement('script');
            scriptTag.src = url;
            scriptTag.type = "text/javascript";
            
            scriptTag.onload = function() {
              resolve(libName);
            };

            scriptTag.onerror = function(event) {
              reject(Error("Failed to load file, ensure if file is present or named correct"));
            }

            document.body.appendChild(scriptTag);
          }
          else {
            console.warn("The file " + libName + " was already loaded and therefore skipped. May be it was loaded by another extension!")
            reject(new Error("The file " + libName + " was already loaded and therefore skipped. May be it was loaded by another extension!"));
          }
        });
      }
  }

  class WidgetRegister {
    constructor(runningOnHololens) {
      this.$injector = angular.element(document.querySelector('[ctrl-name$="_TwxViewController"]')).injector();
      this.scope = angular.element(document.querySelector('[ctrl-name$="_TwxViewController"]')).scope();
      // Get $compiler to add elements as angular compiled DOM object! see injectWidget()
      this.$compile = this.$injector.get("$compile");
      this.renderer = this.$injector.get('tml3dRenderer')
      // Define default widgets Tags and function binding and later add custom 
      this.runningOnHololens = runningOnHololens;

      this.widgets = {
        "twx-dt-tracker"        : this.twxDtTracker.bind(this),
        "twx-dt-target"         : this.twxDtTarget.bind(this),
        "twx-dt-target-spatial" : this.twxDtTargetSpatial.bind(this),
        "twx-dt-target-image"   : this.twxDtTargetImage.bind(this),
        "twx-dt-target-model"   : this.twxDtTargetModel.bind(this),
        "twx-dt-target-area"    : this.twxDtTargetArea.bind(this),
        "twx-dt-image"          : this.twxDtImage.bind(this),
        "twx-dt-label"          : this.twxDtLabel.bind(this),
        "twx-dt-sensor"         : this.twxDtSensor.bind(this),
        "twx-dt-model"          : this.twxDtModel.bind(this),
        "twx-dt-3dbutton"       : this.twxDt3dButton.bind(this),
        "twx-dt-3dpanel"        : this.twxDt3dPanel.bind(this),
        "twx-dt-3dvideo"        : this.twxDt3dVideo.bind(this),
        "twx-dt-3dimage-button" : this.twxDt3dImageButton.bind(this),
        "twx-dt-3dpress-button" : this.twxDt3dPressButton.bind(this),
        "twx-dt-3dtoggle-button": this.twxDt3dToggleButton.bind(this),
        "twx-dt-group"          : this.twxDtGroup.bind(this),
        // Current Implementation of Wayfinder doesn't allow init of widget. Because it use afterEnter Event in isolatedScope :(
        "twx-dt-wayfinder"      : this.twxDtWayfinder.bind(this),
        "twx-dt-3dleaderline"   : this.twxDt3dLeaderline.bind(this)
      }
    }

    addWidget(widgetDefs = [], insertPos = undefined) {
      // create an array if just one object is provided
      if(!Array.isArray(widgetDefs)){
        widgetDefs = [widgetDefs]
      }


      widgetDefs.forEach(initProps=> {
        if(typeof initProps.id === "undefined") {
          console.error("You need to define a unique identifier(id) for your widget. Nothing has been created!")
          return
        }
        else if(this.scope.view.wdg[initProps.id]) {
          console.error("The widget id:[" + initProps.id + "] was already used. Nothing has been created!")
          return
        }
        // Execute the specific built function of selected widgetTag
        if(typeof this.widgets[initProps.originalWidget] !== "undefined") {
          let myWidget = this.widgets[initProps.originalWidget](initProps);
          this.injectWidget(myWidget,insertPos);
        }
        else {
          console.error("The selected widget tag is not registered, please check originalWidget property or load extension first!")
        }
      })
    }

    registerWidget(widgetTag,runtimeTemplate,defaults={}) {
      if (typeof runtimeTemplate !== "undefined") {
        let self = this;
        this.widgets[widgetTag] = function (initProps) {
          let props = self.builtWidgetDefaults(initProps, defaults);
          let result = runtimeTemplate(props);
          return self.builtWidget(widgetTag, result, props);
        }
      }
      else
        console.error("widget need to be a JSON object containing, runtimeTemplate, defaults and WidgetTag ")
    }

    // Not working right now, Targets get init on experience load and can't added later (with current know how)
    twxDtTarget(initProps) {
      let defaults = {
        targetId: '',
        size: 0.0254,
        istracked: false,
        trackingIndicator: true,
        stationary: true,
        src: "vumark",
        isVumark: false,
        url: "app/resources/Default/thing_code_phantom.png",
        rx: -90
      }
      
      let props = this.builtWidgetDefaults(initProps,defaults);
      
      let runtimeTemplate = `<twx-dt-target id="${props.id}" src="vuforia-vumark:///${props.src}?id=${props.targetId}" guide-src="app/resources/Default/thing_code_phantom.png" size="{{me.size}}" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="{{me.rx}}" ry="{{me.ry}}" rz="{{me.rz}}"  ${ props.isVumark ? 'isVumark=""' : '' } istracked="{{me.istracked}}" trackingIndicator="{{me.trackingIndicator}}" stationary="{{me.stationary}}"><twx-dt-image id="${props.id}-image" sx = "{{me.size*4.51}}" sy = "{{me.size*4.51}}" sz = "{{me.size*4.51}}" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="{{me.rx}}" ry="{{me.ry}}" rz="{{me.rz}}" hidden="{{!me.trackingIndicator}}" billboard="{{me.billboard}}" occlude="{{me.occlude}}" decal="{{me.decal}}" shader="recogniser;active f {{pulse}}"  src="img/recognised.png?name=sampler0 img/recognised2.png?name=sampler1" trackingIndicator="{{me.trackingIndicator}}" stationary="{{me.stationary}}"></twx-dt-image></twx-dt-target>`;

      return this.builtWidget('twx-dt-target', runtimeTemplate, props);
    }

    twxDtTargetSpatial(initProps) {
      let defaults = {
        istracked: false,
        rx: -90,
        enablescalegesture: false,
        enabletranslategesture: true,
        enablerotategesture: true,
        services: ['resetGesture']
      }
      
      let props = this.builtWidgetDefaults(initProps,defaults);

      let runtimeTemplate = `<twx-dt-target id="${props.id}" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="{{me.rx}}" ry="{{me.ry}}" rz="{{me.rz}}"  src="spatial://" istracked="{{me.istracked}}" enabletranslategesture="{{me.enabletranslategesture}}" enablerotategesture="{{me.enablerotategesture}}" enablescalegesture="{{me.enablescalegesture}}"></twx-dt-target>`;

      return this.builtWidget('twx-dt-target', runtimeTemplate, props);
    }

    twxDtTargetImage(initProps) {
      let defaults = {
        size: 0.0254,
        istracked: false,
        trackingIndicator: true,
        stationary: true,
        rx: -90,
        targetId: ''
      }
      
      let props = this.builtWidgetDefaults(initProps,defaults);

      let runtimeTemplate = `<twx-dt-target id="${props.id}" guide-src="${ props.url || '/extensions/images/placeholder_img_target.svg' }" size="{{me.size}}" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="{{me.rx}}" ry="{{me.ry}}" rz="{{me.rz}}"  src="vuforia-image:///${props.src}?id=${encodeURIComponent(props.targetId)}" targetId="{{me.targetId}}" istracked="{{me.istracked}}" trackingIndicator="{{me.trackingIndicator}}" stationary="{{me.stationary}}"><twx-dt-image id="${props.id}-targetTracer" sx = "1" sy = "1" sz = "1" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="{{me.rx}}" ry="{{me.ry}}" rz="{{me.rz}}" hidden="{{!me.trackingIndicator}}" billboard="{{me.billboard}}" occlude="{{me.occlude}}" decal="{{me.decal}}" shader="imageRecogniser;active f {{pulse}}; imageWidth f {{tracerWidth}}; imageHeight f {{tracerHeight}}" height="{{me.size}}" width="{{me.size}}"  src="img/recognisedSquare.png?name=gradientSampler" targetId="{{me.targetId}}" stationary="{{me.stationary}}"></twx-dt-image></twx-dt-target>`;

      return this.builtWidget('twx-dt-target', runtimeTemplate, props);
    }

    twxDtTargetModel(initProps) {
      let defaults = {
        size: '',
        istracked: false,
        targetId: '',
        representationSrc: ''
      }
      
      let props = this.builtWidgetDefaults(initProps,defaults);

      let runtimeTemplate = `<twx-dt-target id="${props.id}" guide-src=${props.url} src="vuforia-model:///${props.src}?id=${encodeURIComponent(props.targetId)}" representation-src=${props.representationSrc} x={{me.x}} y={{me.y}} z={{me.z}} rx={{me.rx}} ry={{me.ry}} rz={{me.rz}} size={{me.size}} showRepresentation=${props.representationSrc !== ''}></twx-dt-target>`;

      return this.builtWidget('twx-dt-target', runtimeTemplate, props);
    }

    twxDtTargetArea(initProps) {
      let defaults = {
        istracked: false,
        trackingIndicator: false,
        stationary: true,
        trackerId: '',
        showRepresentation: false,
        applyOcclusion: true,
        guideText: '',
        targetId: ''
      }
      
      let props = this.builtWidgetDefaults(initProps,defaults);

      let runtimeTemplate = `<twx-dt-target id="${props.id}" src="vuforia-area:///${props.src}?id=${encodeURIComponent(props.targetId)}"  guide-src="${this.runningOnHololens ? 'app/resources/_generated_/' + props.targetId + '-area-target-guide.png' : 'extensions/images/area-target-guide.png' }" size=0.1 representation-src="${props.src}_authoring.glb" showRepresentation="{{me.showRepresentation}}"  applyOcclusion="{{me.applyOcclusion}}" guide-text="${ props.guideText || 'Trying to locate ' + props.targetId }" istracked="{{me.istracked}}" trackingIndicator="{{me.trackingIndicator}}" stationary="{{me.stationary}}" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="{{me.rx}}" ry="{{me.ry}}" rz="{{me.rz}}">` + ( props.applyOcclusion ? `<twx-dt-model id="${props.id}-occluder" src="${props.src}_navmesh.glb" occlude="true" opacity="1" hidden="false" decal="false" sx="1" sy="1" sz="1" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="0" ry="0" rz="0"></twx-dt-model>` : '' ) + `</twx-dt-target>`;

      return this.builtWidget('twx-dt-target', runtimeTemplate, props);
    }


    twxDtLabel(initProps) {
      // Widget Defaults for props which are not defined by user or is a global default like x = 0
      let defaults = {
        text: "Label",
        textprops: ''
      }

      // Add the defaults configured specific for this widget to initProps but only if nothing is defined 
      let props = this.builtWidgetDefaults(initProps, defaults);

      // The angular element which is the heart of our Widget 
      let runtimeTemplate = `<twx-dt-label id="${props.id}" text="{{me.text}}" height="{{me.height}}" width="{{me.width}}" class="basic-3d-state-formatting {{me.class}}"
      enablestateformatting="{{me.enableStateFormatting}}" stateformatvalue="{{me.stateFormatValue}}" stateformat="{{me.stateFormat}}" fontfamily="{{me.fontFamily}}" textattrs="{{me.textprops}}" fontcolor="{{me.fontColor}}"
      fontoutlinecolor="{{me.fontOutlineColor}}" sx="{{me.scale}}" sy="{{me.scale}}" sz="{{me.scale}}" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="{{me.rx}}" ry="{{me.ry}}" rz="{{me.rz}}"
      hidden="{{app.fn.getThreeStateBoolInv(me.visible)}}" billboard="{{me.billboard}}" occlude="{{me.occlude}}" decal="{{me.decal}}" experimental-one-sided="{{me.experimentalOneSided}}" opacity="{{me.opacity}}" 
      pivot="{{me.pivot}}" shader="{{me.shader}}"></twx-dt-label>`;

      // Return the finished HTML DOM Element
      return this.builtWidget('twx-dt-label', runtimeTemplate, props);
    }

    twxDtImage(initProps) {
      let runtimeTemplate = `<twx-dt-image id="${initProps.id}" ng-src="{{me.src | trustUrl}}"
      src="" height="{{me.height}}" width="{{me.width}}" class="basic-3d-state-formatting {{me.class}}" sx="{{me.scale}}"
      sy="{{me.scale}}" sz="{{me.scale}}" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="{{me.rx}}" ry="{{me.ry}}" rz="{{me.rz}}" hidden="{{app.fn.getThreeStateBoolInv(me.visible)}}" billboard="{{me.billboard}}"
      occlude="{{me.occlude}}" decal="{{me.decal}}" experimental-one-sided="{{me.experimentalOneSided}}" opacity="{{me.opacity}}" pivot="{{me.pivot}}" shader="{{me.shader}}">#leaderlines#</twx-dt-image>`;
      return this.builtWidget('twx-dt-image', runtimeTemplate, initProps);
    }

    twxDtSensor(initProps) {
      let defaults = {
        text: '###',
        font: 'Arial',
        fontsize: '40px',
        canvasheight: 128.0,
        canvaswidth: 128.0,
        imagex: 0,
        imagey: 0,
        imageattrs: '',
        textx: 64,
        texty: 94,
        textattrs: 'fill:rgba(255, 255, 255, 1);textbaseline:middle;textalign:center',
        billboard: true,
        canvasgrowthoverride: 'image+text',
        src: 'app/resources/Default/vu_gauge1.svg',
        textprops: ''
      }
    
    let props = this.builtWidgetDefaults(initProps,defaults)
    
    let runtimeTemplate = `<twx-dt-sensor id="${props.id}" sx="{{me.scale.split(\' \')[0] || me.scale}}" sy="{{me.scale.split(\' \')[1] || me.scale}}" sz="{{me.scale.split(\' \')[2] || me.scale}}" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="{{me.rx}}" ry="{{me.ry}}" rz="{{me.rz}}"
      hidden="{{app.fn.getThreeStateBoolInv(me.visible)}}" billboard="{{me.billboard}}" occlude="{{me.occlude}}" decal="{{me.decal}}" experimental-one-sided="{{me.experimentalOneSided}}"  opacity="{{me.opacity}}" 
      pivot="{{me.pivot}}" hidden="{{app.fn.getThreeStateBoolInv(me.visible)}}" ng-src="{{me.src | trustUrl}}" src="{{me.src}}" shader="{{me.shader}}" height="{{me.height}}" width="{{me.width}}" 
      canvasheight="{{me.canvasheight}}" canvaswidth="{{me.canvaswidth}}" imageattrs="{{app.fn.buildImageAttrs(me.imagex,me.imagey,me.imageattrs)}}" textattrs="{{app.fn.buildTextAttrs(me.textx,me.texty,me.font,me.fontsize,me.textattrs)}}"
      canvasgrowthoverride="{{me.canvasgrowthoverride}}" textx="{{me.textx}}" texty="{{me.texty}}" imagex="{{me.imagex}}" imagey="{{me.imagey}}" text="{{me.text}}" interactable-hint="true">#leaderlines#</twx-dt-sensor>`;
    
      return this.builtWidget('twx-dt-sensor', runtimeTemplate, props);
    }

    twxDtModel(initProps) {
      let defaults = {
        forceHidden: false,
        translucent: false,
        sequence: '',
        services: ['forward', 'play', 'playAll', 'reset', 'rewind', 'stop']
      }

      let props = this.builtWidgetDefaults(initProps, defaults)

      let runtimeTemplate = `<twx-dt-model id="${props.id}" ng-src='{{me.src | trustUrl}}' src="{{me.src}}"  sx="{{me.scale.split(' ')[0] || me.scale}}" sy="{{me.scale.split(' ')[1] || me.scale}}" sz="{{me.scale.split(' ')[2] || me.scale}}" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="{{me.rx}}" ry="{{me.ry}}" rz="{{me.rz}}" hidden={{app.fn.getThreeStateBoolInv(me.visible)}}  force-hidden="{{me.forceHidden}}" occlude="{{me.occlude}}" decal="{{me.decal}}" opacity="{{me.opacity}}" phantom="{{!me.translucent}}"  shader="{{me.shader}}" sequenceList="{{me.sequenceList}}" sequence="{{me.sequence}}" showSequenceInCanvas="{{me.showSequenceInCanvas}}" steps="{{me.steps}}" currentStep="{{me.currentStep}}" stepName="{{me.stepName}}" stepDescription="{{me.stepDescription}}" playing="{{me.playing}}" sequencePartIds="{{me.sequencePartIds}}" ><twx-container-content></twx-container-content></twx-dt-model>`;

      return this.builtWidget('twx-dt-model', runtimeTemplate, props);
    }

    twxDt3dButton(initProps) {
      let defaults = {
        height: 0.045,
        width: 0.16,
        fontColor: 'rgba(65, 65, 65, 1);',
        buttonColor: 'rgba(235, 235, 235, 1);'
      }

      let props = this.builtWidgetDefaults(initProps, defaults);

      let runtimeTemplate = `<twx-dt-3dbutton id="${props.id}" text="{{me.text}}" ng-src="{{me.src | trustUrl}}" src="" height="{{me.height}}" width="{{me.width}}"
      fontcolor="{{me.fontColor.endsWith(\';\')? me.fontColor.slice(0, -1): me.fontColor}}" fontOutlineColor="{{me.fontColor.endsWith(\';\')? me.fontColor.slice(0, -1): me.fontColor}}" 
      color="{{me.color.endsWith(\';\')? me.color.slice(0, -1): me.color}}" backercolor="{{me.color.endsWith(\';\')? me.color.slice(0, -1): me.color}}"
      x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="{{me.rx}}" ry="{{me.ry}}" rz="{{me.rz}}" hidden="{{app.fn.getThreeStateBoolInv(me.visible)}}" shader="ButtonFullEffects"
      backervisibility="{{me.backervisibility}}" interactable-hint="true"></twx-dt-3dbutton>`;
      return this.builtWidget('twx-dt-3dbutton', runtimeTemplate, props);
    }

    twxDt3dPanel(initProps) {
      let defaults = {
        tagalong: false,
        width: 0.3,
        height: 0.3,
        snap: 0.5,
        offsetz: 0.6,
        offsetx: 0,
        buttonColor: 'rgba(38,97,148,1);',
        panelColor: 'rgba(20, 0, 0, 1);',
        shader: 'ButtonEdge',
        services: ['show','hide']
      }
      let props = this.builtWidgetDefaults(initProps,defaults)

      const pinBtnPosSize = widget3dUtils.getPanelPinButtonRelativePositionAndSize(Number(props.width), Number(props.height));

      const pinBtnSrc = widget3dUtils.getRuntimeTagalongIcon(props.tagalong);

      let runtimeTemplate = `<ng-panel3d
            id-field=${props.id}
            isholo-field=true
            shader-field={{me.shader}}
            visible-field={{me.visible}}
            width-field={{me.width}}
            height-field={{me.height}}
            tagalong-field=me.tagalong
            billboard-field={{me.billboard}}
            delegate-field="delegate"
          >
            <twx-dt-group
              id=${props.id}
              panelColor="{{me.panelColor}}"
              x="{{me.x}}" y="{{me.y}}" z="{{me.z}}"
              rx="{{me.rx}}" ry="{{me.ry}}" rz="{{me.rz}}"
              sx=1 sy=1 sz=1
              shader=""
              hidden="{{app.fn.getThreeStateBoolInv(me.visible)}}"
              billboard={{me.billboard}}
              tagalong={{me.tagalong}}
              tagalong-snapping-distance="{{me.snap}}"
              tagalong-offset="{{me.offsetx}} {{me.offsetz}}"
            >
              <twx-dt-model
                id=${props.id}-panel
                src='${widget3dUtils.BoxPrimitiveTemplate}'
                opacity="1"
                hidden=-1
                x=0 y=0 z=-0.01
                rx=0 ry=0 rz=0
                sx={{me.width}} sy={{me.height}} sz=1
                decal="false"
                shader="{{me.shader}}"
              >
                <twx-dt-modelitem
                  id=${props.id}-panel-model-item"
                  for=${props.id}-panel
                  occurrence="/"
                  color="{{app.fn.sanitizeRgbColor(me.panelColor)}}"
                >
                </twx-dt-modelitem>
              </twx-dt-model>
              <ng-toggle3d
                id="${props.id}-pin"
                id-field="${props.id}-pin"
                isholo-field=true
                height-field=${pinBtnPosSize.size}
                width-field=${pinBtnPosSize.size}
                font-field="{{me.fontColor.endsWith(&apos;;&apos;)? me.fontColor.slice(0, -1): me.fontColor}}"
                text-field=""
                textnotpressed-field=""
                src-field=${widget3dUtils.getRuntimeTagalongIcon(true)}
                srcnotpressed-field=${widget3dUtils.getRuntimeTagalongIcon(false)}
                pressed-field="me.tagalong"
                disabled-field=false
                delegate-field="delegate"
                color-field={{app.fn.sanitizeRgbColor(me.buttonColor)}}
              >
                <twx-dt-3dbutton
                  id="${props.id}-pin"
                  class="toggle3dWidget"
                  text=""
                  src=${pinBtnSrc}
                  height=${pinBtnPosSize.size} width=${pinBtnPosSize.size}
                  fontcolor="{{me.fontColor.endsWith(&apos;;&apos;)? me.fontColor.slice(0, -1): me.fontColor}}"
                  fontoutlinecolor="{{me.fontColor.endsWith(&apos;;&apos;)? me.fontColor.slice(0, -1): me.fontColor}}"
                  color="{{app.fn.sanitizeRgbColor(me.buttonColor)}}"
                  backercolor="{{app.fn.sanitizeRgbColor(me.buttonColor)}}"
                  x=${pinBtnPosSize.x} y=${pinBtnPosSize.y} z=${pinBtnPosSize.z}
                  rx=0 ry=0 rz=0
                  hidden=-1
                  interactable-hint="true"
                  backervisibility="false"
                >
                </twx-dt-3dbutton>
              </ng-toggle3d>
              <twx-container-content>#children#</twx-container-content>
            </twx-dt-group>
          </ng-panel3d>`;
      
      return this.builtWidget('twx-dt-3dpanel', runtimeTemplate, props);
    }

    
    // Group Widget normaly used by the 3D panel widget. It works pretty well as stand alone.
    // This Widget is able to get nested!
    twxDtGroup(initProps) {
      let runtimeTemplate = `<twx-dt-group id="${initProps.id}" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}"
        rx="{{me.rx}}" ry="{{me.ry}}" rz="{{me.rz}}" sx=1 sy=1 sz=1 shader=""
        hidden="{{app.fn.getThreeStateBoolInv(me.visible)}}" billboard={{me.billboard}}>
        <twx-container-content>#children#</twx-container-content>
      </twx-dt-group>`;
      return this.builtWidget('twx-dt-group', runtimeTemplate, initProps);
    }

    twxDtTracker(initProps) {
      let runtimeTemplate = `<twx-dt-tracker id="${initProps.id}" enabletrackingevents="${initProps.enabletrackingevents}"><twx-container-content></twx-container-content></twx-dt-tracker>`;
      this.injectWidget(runtimeTemplate, document.querySelector("twx-dt-view"));
      //return this.builtWidget('twx-dt-tracker', runtimeTemplate, initProps);
    }

    twxDt3dVideo(initProps) {
      let defaults = {
        snap: 0.5,
        offsetz: 0.6,
        offsetx: 0,
        tagalong: false,
        width: 0.22,
        height: 0.186,
        hideControls: false,
        preload: true,
        isPlaying: false,
        buttonColor: 'rgba(38,97,148,1);',
        panelColor: 'rgba(20, 0, 0, 1);',
        shader: 'ButtonEdge',
        services: ['play','pause','stop','skipahead','skipback']
      }
      let props = this.builtWidgetDefaults(initProps,defaults);

      let height = Number(props.height);
      let width = Number(props.width);
      
      // Calculate new position for buttons:
      let pinBtnPosSize = widget3dUtils.getPanelPinButtonRelativePositionAndSize(width, height);
      let mediaBtnsPosSize = widget3dUtils.getPanelMediaControlButtonsRelativePositionsAndSize(width, height);

      // Calculate new position for image:
      let imageWidth = width - widget3dUtils.PanelEdgeMinMargin * 2;
      let imageHeight = height - widget3dUtils.PanelEdgeMinMargin * 2;
      let hideControls = props.hideControls === 'true' || props.hideControls === true;
      if (!hideControls) {
        imageHeight -= widget3dUtils.PanelChildWidgetsMinMargin + mediaBtnsPosSize.size;
      }

      let yLocImage = height / 2 - widget3dUtils.PanelEdgeMinMargin - imageHeight / 2;

      const pinBtnSrc = widget3dUtils.getRuntimeTagalongIcon(props.tagalong);

      const buttonsHidden = "'{{app.fn.isTrue(me.hideControls) ? true : -1}}'";
      let runtimeTemplate = `<ng-video3d id-field="${props.id}" isholo-field="true" src-field="{{me.src | trustUrl}}" height-field={{me.height}}
      width-field={{me.width}} showcontrols-field="{{!app.fn.isTrue(me.hideControls)}}" playing-field="me.isPlaying"
      tagalong-field=me.tagalong buttons-size-field=${mediaBtnsPosSize.size} delegate-field="delegate">
      <twx-dt-group id="${props.id}" x={{me.x}} y={{me.y}} z={{me.z}} rx={{me.rx}} ry={{me.ry}} rz={{me.rz}} sx=1 sy=1
        sz=1 hidden="{{app.fn.getThreeStateBoolInv(me.visible)}}" shader="ButtonEdge" opacity=1 tagalong={{me.tagalong}} tagalong-snapping-distance="{{me.snap}}"
        tagalong-offset="{{me.offsetx}} {{me.offsetz}}">
        <twx-dt-model id="${props.id}-panel" x=0 y=0 z=-0.01 rx=0 ry=0 rz=0
          sx="{{me.width}}" sy="{{me.height}}" sz=1 hidden=-1 decal="false" shader="ButtonEdge" src='${widget3dUtils.BoxPrimitiveTemplate}'>
          <twx-dt-modelitem id="${props.id}-model-item" for="${props.id}-panel" occurrence="/"
            color="{{app.fn.sanitizeRgbColor(me.panelColor)}}">
          </twx-dt-modelitem>
        </twx-dt-model>
        <twx-dt-video id="${props.id}-video" src="{{me.src | trustUrl}}" height=${imageHeight} width=${imageWidth} x=0
          y=${yLocImage} z=0 rx=0 ry=0 rz=0 sx=1 sy=1 sz=1 hidden=-1 preload="{{me.preload}}" interactable-hint="true"
          decal="false" pivot="5" shader="Default">
        </twx-dt-video>
        <ng-press3d id="${props.id}-next" id-field="${props.id}-next" isholo-field="true"
          height-field=${mediaBtnsPosSize.size} width-field=${mediaBtnsPosSize.size}
          color="{{app.fn.sanitizeRgbColor(me.buttonColor)}}" text-field=""
          src-field="app/resources/Default/3D_Video_Skip_Ahead.png" disabled-field=false
          color-field={{app.fn.sanitizeRgbColor(me.buttonColor)}}>
          <twx-dt-3dbutton id="${props.id}-next" src="app/resources/Default/3D_Video_Skip_Ahead.png" text=""
            height=${mediaBtnsPosSize.size} width=${mediaBtnsPosSize.size}
            color="{{app.fn.sanitizeRgbColor(me.buttonColor)}}"
            backercolor="{{app.fn.sanitizeRgbColor(me.buttonColor)}}" x=${mediaBtnsPosSize.xSkipA}
            y=${mediaBtnsPosSize.y} z=0 rx=0 ry=0 rz=0 hidden=${buttonsHidden} interactable-hint="true"
            backervisibility="false"></twx-dt-3dbutton>
        </ng-press3d>
        <ng-press3d id="${props.id}-prev" id-field="${props.id}-prev" isholo-field="true"
          height-field=${mediaBtnsPosSize.size} width-field=${mediaBtnsPosSize.size}
          color="{{app.fn.sanitizeRgbColor(me.buttonColor)}}" text-field=""
          src-field="app/resources/Default/3D_Video_Skip_Back.png" disabled-field=false
          color-field={{app.fn.sanitizeRgbColor(me.buttonColor)}}>
          <twx-dt-3dbutton id="${props.id}-prev" src="app/resources/Default/3D_Video_Skip_Back.png" text=""
            height=${mediaBtnsPosSize.size} width=${mediaBtnsPosSize.size}
            color="{{app.fn.sanitizeRgbColor(me.buttonColor)}}"
            backercolor="{{app.fn.sanitizeRgbColor(me.buttonColor)}}" x=${mediaBtnsPosSize.xSkipB}
            y=${mediaBtnsPosSize.y} z=0 rx=0 ry=0 rz=0 hidden=${buttonsHidden} interactable-hint="true"
            backervisibility="false"></twx-dt-3dbutton>
        </ng-press3d>
        <ng-press3d id="${props.id}-stop" id-field="${props.id}-stop" isholo-field="true"
          height-field=${mediaBtnsPosSize.size} width-field=${mediaBtnsPosSize.size}
          color="{{app.fn.sanitizeRgbColor(me.buttonColor)}}" text-field=""
          src-field="app/resources/Default/3D_Video_Stop.png" disabled-field=false
          color-field={{app.fn.sanitizeRgbColor(me.buttonColor)}}>
          <twx-dt-3dbutton id="${props.id}-stop" src="app/resources/Default/3D_Video_Stop.png" text=""
            height=${mediaBtnsPosSize.size} width=${mediaBtnsPosSize.size}
            color="{{app.fn.sanitizeRgbColor(me.buttonColor)}}"
            backercolor="{{app.fn.sanitizeRgbColor(me.buttonColor)}}" x=${mediaBtnsPosSize.xStop}
            y=${mediaBtnsPosSize.y} z=0 rx=0 ry=0 rz=0 hidden=${buttonsHidden} interactable-hint="true"
            backervisibility="false"></twx-dt-3dbutton>
        </ng-press3d>
        <ng-toggle3d id="${props.id}-play" id-field="${props.id}-play" isholo-field="true"
          height-field=${mediaBtnsPosSize.size} width-field=${mediaBtnsPosSize.size}
          color="{{app.fn.sanitizeRgbColor(me.buttonColor)}}" text-field="" textnotpressed-field=""
          src-field="app/resources/Default/3D_Video_Pause.png"
          srcnotpressed-field="app/resources/Default/3D_Video_Play.png" pressed-field="me.isPlaying"
          disabled-field=false delegate-field="delegate" color-field={{app.fn.sanitizeRgbColor(me.buttonColor)}}>
          <twx-dt-3dbutton id="${props.id}-play" text="" src="app/resources/Default/3D_Video_Play.png"
            height=${mediaBtnsPosSize.size} width=${mediaBtnsPosSize.size}
            color="{{app.fn.sanitizeRgbColor(me.buttonColor)}}"
            backercolor="{{app.fn.sanitizeRgbColor(me.buttonColor)}}" x=${mediaBtnsPosSize.xPlay}
            y=${mediaBtnsPosSize.y} z=0 rx=0 ry=0 rz=0 hidden=${buttonsHidden} interactable-hint="true"
            backervisibility="false"></twx-dt-3dbutton>
        </ng-toggle3d>
        <ng-toggle3d id="${props.id}-pin" id-field="${props.id}-pin" isholo-field="true"
          height-field=${pinBtnPosSize.size} width-field=${pinBtnPosSize.size}
          font-field="{{me.fontColor.endsWith(&apos;;&apos;)? me.fontColor.slice(0, -1): me.fontColor}}" text-field=""
          textnotpressed-field="" src-field=${widget3dUtils.getRuntimeTagalongIcon(true)}
          srcnotpressed-field=${widget3dUtils.getRuntimeTagalongIcon(false)} pressed-field="me.tagalong"
          disabled-field=false delegate-field="delegate" color-field={{app.fn.sanitizeRgbColor(me.buttonColor)}}>
          <twx-dt-3dbutton id="${props.id}-pin" class="toggle3dWidget" text="" src=${pinBtnSrc}
            height=${pinBtnPosSize.size} width=${pinBtnPosSize.size}
            fontcolor="{{me.fontColor.endsWith(&apos;;&apos;)? me.fontColor.slice(0, -1): me.fontColor}}"
            fontoutlinecolor="{{me.fontColor.endsWith(&apos;;&apos;)? me.fontColor.slice(0, -1): me.fontColor}}"
            color="{{app.fn.sanitizeRgbColor(me.buttonColor)}}"
            backercolor="{{app.fn.sanitizeRgbColor(me.buttonColor)}}" x=${pinBtnPosSize.x} y=${pinBtnPosSize.y}
            z=${pinBtnPosSize.z} rx=0 ry=0 rz=0 hidden=-1 interactable-hint="true" backervisibility="false">
          </twx-dt-3dbutton>
        </ng-toggle3d>
      </twx-dt-group>
    </ng-video3d>`
      
      return this.builtWidget('twx-dt-3dvideo', runtimeTemplate, props);
    }

    twxDt3dImageButton(initProps) {
      let defaults = {
        height: 0.04,
        width: 0.04,
        text: '',
        src: 'app/resources/Default/toggleMissing.png',
        textNotPressed: '',
        srcNotPressed: '',
        pressed: false,
        fontColor: 'rgba(255, 255, 255, 1);',
        color: 'rgba(28, 97, 148, 1);',
        disabled: false,
        services: ['set','reset']
      }

      let props = this.builtWidgetDefaults(initProps,defaults);

      let runtimeTemplate = `<ng-toggle3d id-field="${props.id}" isholo-field="true" height-field={{me.height}} width-field={{me.width}}
      font-field="{{app.fn.sanitizeRgbColor(me.fontColor)}}" text-field={{me.text}}
      textnotpressed-field={{me.textNotPressed}} smallicon-field="false" multilinetext-field="false"
      src-field={{me.src}} srcnotpressed-field={{me.srcNotPressed}} pressed-field="me.pressed"
      disabled-field="me.disabled" delegate-field="delegate" color-field={{app.fn.sanitizeRgbColor(me.color)}}>
      <twx-dt-3dbutton id="${props.id}" text="" height="{{me.height}}" width="{{me.width}}"
        fontcolor="{{app.fn.sanitizeRgbColor(me.fontColor)}}"
        fontoutlinecolor="{{app.fn.sanitizeRgbColor(me.fontColor)}}" color="{{app.fn.sanitizeRgbColor(me.color)}}"
        backercolor="{{app.fn.sanitizeRgbColor(me.color)}}" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="{{me.rx}}"
        ry="{{me.ry}}" rz="{{me.rz}}" hidden={{app.fn.getThreeStateBoolInv(me.visible)}} shader="ButtonFullEffects"
        interactable-hint="true" backervisibility="false">
      </twx-dt-3dbutton></ng-toggle3d>`;
      // use replace click here to be more align with other widgets so you can pass also click as event and it gets parsed to pressed
      return this.builtWidget('twx-dt-3dimage-button', runtimeTemplate, props).replace(' name="click" ', ' name="pressed" ')
    }

    twxDt3dPressButton(initProps) {
      let defaults = {
        height: 0.04,
        width: 0.04,
        text: 'Button',
        src: '',
        fontColor: 'rgba(255, 255, 255, 1);',
        color: 'rgba(28, 97, 148, 1);',
        disabled: false,
        fontsize: "120"
      }

      let props = this.builtWidgetDefaults(initProps,defaults);

      let runtimeTemplate = `<ng-press3d id-field="${props.id}" isholo-field="true" height-field={{me.height}}
        width-field={{me.width}} font-field="{{app.fn.sanitizeRgbColor(me.fontColor)}}" text-field={{me.text}}
        src-field={{me.src}} disabled-field="me.disabled" color-field={{app.fn.sanitizeRgbColor(me.color)}}>
        <twx-dt-3dbutton id="${props.id}" class="press3dWidget" text="" height="{{me.height}}"
          width="{{me.width}}" fontcolor="{{app.fn.sanitizeRgbColor(me.fontColor)}}"
          fontoutlinecolor="{{app.fn.sanitizeRgbColor(me.fontColor)}}" color="{{app.fn.sanitizeRgbColor(me.color)}}"
          backercolor="{{app.fn.sanitizeRgbColor(me.color)}}" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="{{me.rx}}"
          ry="{{me.ry}}" rz="{{me.rz}}" hidden="{{app.fn.getThreeStateBoolInv(me.visible)}}" shader="ButtonFullEffects"
          interactable-hint="true" backervisibility="false">
        </twx-dt-3dbutton>
      </ng-press3d>`;
      // use replace click here to be more align with other widgets so you can pass also click as event and it gets parsed to pressed
      return this.builtWidget('twx-dt-3dpress-button', runtimeTemplate, props).replace(' name="click" ', ' name="pressed" ')
    }

    twxDt3dToggleButton(initProps) {
      let defaults = {
        height: 0.04,
        width: 0.04,
        text: '',
        src: 'app/resources/Default/toggleOn.png',
        textNotPressed: '',
        srcNotPressed: 'app/resources/Default/toggleOff.png',
        pressed: false,
        fontColor: 'rgba(255, 255, 255, 1);',
        color: 'rgba(28, 97, 148, 1);',
        disabled: false,
        services: ['set','reset']
      }

      let props = this.builtWidgetDefaults(initProps,defaults);

      let runtimeTemplate = `<ng-toggle3d id-field="${props.id}" isholo-field="true" height-field={{me.height}}
        width-field={{me.width}} font-field="{{app.fn.sanitizeRgbColor(me.fontColor)}}" text-field={{me.text}}
        textnotpressed-field={{me.textNotPressed}} src-field={{me.src}} srcnotpressed-field={{me.srcNotPressed}}
        pressed-field="me.pressed" disabled-field="me.disabled" delegate-field="delegate" color-field={{app.fn.sanitizeRgbColor(me.color)}}>
        <twx-dt-3dbutton
          id="${props.id}" text="" height="{{me.height}}" width="{{me.width}}" fontcolor="{{app.fn.sanitizeRgbColor(me.fontColor)}}"
          fontoutlinecolor="{{app.fn.sanitizeRgbColor(me.fontColor)}}" color="{{app.fn.sanitizeRgbColor(me.color)}}"
          backercolor="{{app.fn.sanitizeRgbColor(me.color)}}" x="{{me.x}}" y="{{me.y}}" z="{{me.z}}" rx="{{me.rx}}" ry="{{me.ry}}" rz="{{me.rz}}"
          hidden="{{app.fn.getThreeStateBoolInv(me.visible)}}" shader="ButtonFullEffects" interactable-hint="true" backervisibility="false">
        </twx-dt-3dbutton>
      </ng-toggle3d>`;
      // use replace click here to be more align with other widgets so you can pass also click as event and it gets parsed to pressed
      return this.builtWidget('twx-dt-3dtoggle-button', runtimeTemplate, props).replace(' name="click" ', ' name="pressed" ')
    }

    twxDtWayfinder(initProps) {
      let defaults = {
        ribbonColor: '#FFA500',
        eventRadius: 0.25,
        wayfinderDisplayBoundary: 0.5,
        autoAdvance: false,
        looping: false,
        showRibbon: true,
        showWaypoints: true,
        showLabels: true,
        labelsOnTop: false,
        enabled: true,
        showReticle: true,
        selectedWaypointIndex: 0,
        waypointsData: [],
        services: ['next','previous']
      }

      let props = this.builtWidgetDefaults(initProps,defaults);
      let runtimeTemplate = '';

      /* this.renderer.setShader("navfogged", 
      `attribute vec3 vertexPosition;
      attribute vec2 vertexTexCoord;
      varying vec2 texCoord;
      varying float dist;
      uniform mat4 modelViewProjectionMatrix;
      uniform mat4 modelViewMatrix;
      uniform mat4 modelMatrix;
      uniform mat4 normalMatrix;

      void main() {
        vec4 vertexNormal=vec4(0.,0.,1.,0.);
        vec4 vp = vec4(vertexPosition, 1.0);
        gl_Position = modelViewProjectionMatrix * vp;
        texCoord = vertexTexCoord;
        vec3 vv = vec3(modelViewMatrix * vp);
        dist = length(vv);
      }`, `precision mediump float;
      varying vec2 texCoord;
      varying float dist;
      uniform sampler2D img;
      uniform float fade;
      uniform float r;
      uniform float g;
      uniform float b;
      uniform vec4 surfaceColor;

      void main(void) {
        gl_FragColor = vec4(r,g,b, 1.);
      }`); */

      const forholo = this.runningOnHololens;
      const reticleTagalongDistance = 1;
      const waypointLabelStyle = 'padding: 4em;';
      const bracketsImagePath = 'img/wayfinder_frame.png';
      const waypointImagePath = 'img/waypoint_placeholder.svg';

      const screenOverlayElements = `
        <div
          ng-show="wayfinderReticleVisibility"
          style="height: 100vh; width: 100vw; top: 0vh; position: absolute; pointer-events: none;"
        >
          <img
            id="wayfinder_frame"
            src="${bracketsImagePath}"
            style="width: 144px; height: 144px; margin-left:-72px; margin-top:-72px; top: 50%; left: 50%; pointer-events: none; position:absolute;"
          />
          <img
            id="wayfinder_circle"
            src="{{app.fn.getWayfinderIconSource('wayfinder_circle',me.ribbonColor)}}"
            style="width: 48px; height: 48px; margin-left:-24px; margin-top:-24px; top: 50%; left: 50%; pointer-events: none; position:absolute;"
          />
          <img
            id="wayfinder_icon"
            src="{{app.fn.getWayfinderIconSource('wayfinder_icon',me.ribbonColor)}}"
            style="width: 20px; height: 24px; margin-left:-10px; margin-top:-12px; top: 50%; left: 50%; pointer-events: none; position:absolute;"
          />
        </div>
        <div
          ng-show="wayfinderOffscreenIndicatorVisibility"
          style="height: 100vh; width: 100vw; top: 0vh; position: absolute; pointer-events: none;"
        >
          <img
            id="wayfinder_arrow"
            src="{{app.fn.getWayfinderIconSource('wayfinder_arrow',me.ribbonColor)}}"
            style="width: 24px; height: 24px; margin-left:-12px; margin-top:-12px; transform: {{wayfinderOffscreenIndicatorRotation}}; top: {{wayfinderOffscreenIndicatorTop}}; left: {{wayfinderOffscreenIndicatorLeft}}; pointer-events: none; position:absolute;"
          />
        </div>
      `;

      // Bad practise :( guys!!!
      const vs1g = `
        <script name="navfogged" type="x-shader/x-vertex"> 
          attribute vec3 vertexPosition;
          attribute vec2 vertexTexCoord;
          varying vec2 texCoord;
          varying float dist;
          uniform mat4 modelViewProjectionMatrix;
          uniform mat4 modelViewMatrix;
          uniform mat4 modelMatrix;
          uniform mat4 normalMatrix;

          void main() {
            vec4 vertexNormal=vec4(0.,0.,1.,0.);
            vec4 vp = vec4(vertexPosition, 1.0);
            gl_Position = modelViewProjectionMatrix * vp;
            texCoord = vertexTexCoord;
            vec3 vv = vec3(modelViewMatrix * vp);
            dist = length(vv);
          }
          </script>
      `;
      const ps1g = `
        <script name="navfogged" type="x-shader/x-fragment">
          precision mediump float;
          varying vec2 texCoord;
          varying float dist;
          uniform sampler2D img;
          uniform float fade;
          uniform float r;
          uniform float g;
          uniform float b;
          uniform vec4 surfaceColor;

          void main(void) {
            gl_FragColor = vec4(r,g,b, 1.);
          }
        </script>
      `;

      const ribbonElements = `
        <div ng-repeat="obj in wayfinderHelper.ribbonSphereObjects">
          <twx-dt-model
            id="{{obj.name}}"
            x=0 y=0 z=0
            rx=0 ry=0 rz=0
            opacity=1.0
            src="{{obj.src}}"
            decal=true
            hidden=true
            shader="navfogged"
          >
          </twx-dt-model>
        </div>
      `;
      const ctrl = `
      <div ng-wayfinder 
        id-field=${props.id}
        isholo-field=${forholo}
        enabled-field="me.enabled"
        showwaypoints-field={{me.showWaypoints}}
        showribbon-field={{me.showRibbon}}
        showreticle-field={{me.showReticle}}
        wayfinderdisplayboundary-field={{me.wayfinderDisplayBoundary}}
        eventradius-field={{me.eventRadius}}
        autoadvance-field={{me.autoAdvance}}
        looping-field={{me.looping}}
        waypointsdata-field="me.waypointsData"
        selectedwaypointindex-field="me.selectedWaypointIndex"
        selectedwaypointdata-field="me.selectedWaypointData"
        ribboncolor-field={{me.ribbonColor}}
        showlabels-field={{me.showLabels}}
        reticle-tagalong-distance-field = ${reticleTagalongDistance}
        delegate-field="delegate"
      >
      </div>`;

      const waypointElementsForMobileAndPreview = `
        <twx-dt-image
          id="activeWaypointImage"
          src="${waypointImagePath}"
          opacity=1.0
          sx=1 sy=1 sz=1
          hidden=true
          decal=true
          billboard=true
          shader=""
        >
        </twx-dt-image>
        <twx-dt-label
          id="activeWaypointLabel"
          class="waypoint-label"
          y=0.09
          text=""
          style="${waypointLabelStyle}"
          sx=1 sy=1 sz=1
          hidden=true
          billboard=true
          decal={{me.labelsOnTop}}
          opacity=1.0
        >
        </twx-dt-label>
      `;
      const waypointElementsForHoloLens = `
          <twx-dt-group
            id ="activeWaypoint"
            hidden=true
          >
            ${waypointElementsForMobileAndPreview}
          </twx-dt-group>
        `;

      const guideElementsForHoloLens = `
          <twx-dt-group
            id="wayPointGuide"
            tagalong=2 tagalong-snapping-distance=0 tagalong-offset="0 ${reticleTagalongDistance}"
            hidden=true
          >
            <twx-dt-image
              id="wayPointGuideBrackets"
              height=0.09 width=0.09
              src="${bracketsImagePath}"
              hidden=-1
              decal=true
            >
            </twx-dt-image>
            <twx-dt-image
              id="wayPointGuideCompass"
              height=0.04
              z=-0.001
              src="{{app.fn.getWayfinderIconSource('wayfinder_arrow',me.ribbonColor)}}"
              hidden=-1
              decal=true
            >
            </twx-dt-image>
            <twx-dt-image
              id="wayPointGuideCircle"
              height=0.04 width=0.04
              z=-0.001
              src="{{app.fn.getWayfinderIconSource('wayfinder_circle',me.ribbonColor)}}"
              hidden=-1
              decal=true
            >
            </twx-dt-image>
            <twx-dt-image
              id="wayPointGuideIcon"
              height=0.02
              z=-0.002
              src="{{app.fn.getWayfinderIconSource('wayfinder_icon',me.ribbonColor)}}"
              hidden=-1
              decal=true
            >
            </twx-dt-image>
            <twx-dt-image
              id="wayPointGuidePlaceholder"
              src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
              z=-0.0003
              height=0.0001
              hidden=-1
              decal=false
            >
            </twx-dt-image>
          </twx-dt-group>
        `;

      if (forholo) {
        runtimeTemplate = (
          ctrl +
          waypointElementsForHoloLens +
          guideElementsForHoloLens +
          // these are required just for preview:
          screenOverlayElements +
          ribbonElements
        );
      } else {
        runtimeTemplate = ctrl + waypointElementsForMobileAndPreview + screenOverlayElements + ribbonElements;
      }

      return this.builtWidget('twx-dt-wayfinder', runtimeTemplate, props);
    }

    twxDt3dLeaderline(initProps) {
      let defaults = {
        x: 0,
        y: 0,
        z: 0,
        color: 'rgb(0,255,255)',
        thickness: '0.8',
        kneeJointLength: 0
      }

      let props = this.builtWidgetDefaults(initProps,defaults);

      let runtimeTemplate = `<twx-dt-3dleaderline
            id="${props.id}"
            x={{me.x}}
            y={{me.y}}
            z={{me.z}}
            from="{{me.originWidgetId}}"
            to={{me.destinationWidgetId}}
            occurrence="{{me.occurrence}}"
            knee-joint-length={{me.kneeJointLength}}
            thickness={{me.thickness}}
            color="{{me.color}}"
          >
          </twx-dt-3dleaderline>`;

        return this.builtWidget('twx-dt-3dLeaderline', runtimeTemplate, props);
    }

    builtWidgetDefaults(initProps, defaults) {
      for(let prop in defaults) {
        if(typeof initProps[prop] === "undefined")
        initProps[prop] = defaults[prop]
      }
      return initProps;
    }

    builtEvents(allEvents=[]) {
      if(Array.isArray(allEvents)) {
        let events = "";
        allEvents.forEach(evt => {
          events+= `<twx-widget-event name="${evt.name}" ${typeof evt.value === "string" ? 'value="'+evt.value+'"': ""}></twx-widget-event>`
        })
        return events;
      }
      else
        return "";
    }

    builtServices(allServices=[]) {
      if(Array.isArray(allServices)) {
        let services = "";
        allServices.forEach(srv => {
          services+= `<twx-widget-service name="${srv}"></twx-widget-service>`
        })
        return services;
      }
      else
        return "";
    }

    builtInitProperties(template, initProps) {
      let templStr = new String(template)
      let re = new RegExp(/\bme.(\w+)/gm);
      let m;
      let propsArray = [];
      do {
        m = re.exec(template);
        if (m)
          propsArray.push(m[1]);
      } while (m);
      //let propsArray = Array.from(templStr.matchAll(/\bme.(\w+)/gm), m => m[1]); //propsArray = template.match(/\b(?<=me.)\w+/gm);  //This is the old regex producing errors on iOS
      let properties = {};
      properties.widgetName = {
        value: initProps.id,
        datatype: "string"
      }
      // Remove duplicates like scale
      propsArray.forEach((prop) => {
        if (typeof properties[prop] === "undefined") {
          properties[prop] = {};
          // Check if we have input Values for init and if so add it to value
          if (typeof initProps[prop] !== "undefined") {
            properties[prop].value = initProps[prop];
          } else {
            properties[prop].value = undefined
          }

          //Studio default datatype Number
          if (prop === "src" || prop === "sequence")
            properties[prop].datatype = "resource_url";
          else if (['x', 'y', 'z', 'rx', 'ry', 'rz', 'width', 'height', 'opacity'].includes(prop)) {
            properties[prop].datatype = "number";
          } else if (['visible', 'billboard', 'occlude', 'decal', 'experimentalOneSided', 'tagalong', 'enableStateFormatting'].includes(prop)) {
            properties[prop].datatype = "boolean";
          } else if (['scale', 'shader', 'text', 'class'].includes(prop)) {
            properties[prop].datatype = "string";
          } else if (['pivot'].includes(prop)) {
            properties[prop].datatype = "select";
          } else {
            properties[prop].datatype = "string";
          }

          if (properties[prop].value == undefined) {
            switch (prop) {
              //Numbers
              case 'x':
              case 'y':
              case 'z':
              case 'rx':
              case 'ry':
              case 'rz':
                properties[prop].value = 0.0;
                break;
              case 'opacity':
                properties[prop].value = 1;
                break;
              case 'height':
              case 'width':
                properties[prop].value = '';
                break;
              case 'pivot':
                properties[prop].value = "5";
                break;
              case 'visible':
                properties[prop].value = true;
                break;
              case 'billboard':
              case 'occlude':
              case 'decal':
              case 'experimentalOneSided':
              case 'enableStateFormatting':
                properties[prop].value = false;
                break;
              case 'scale':
                properties[prop].value = "1.0";
                break;
              case 'shader':
              case 'src':
                properties[prop].value = '';
                break;
              case 'stateFormatValue':
                properties[prop].value = 'text';
                break;
              default:
                break;
            }
          }
        }
      });

      let propertiesStr = "";
      for (let name in properties) {
        let prop = properties[name];
        propertiesStr += `<twx-widget-property name="${name}" datatype="${prop.datatype}" ${(prop.value === '' ? ' value' : (prop.value != undefined ? ` value="` + prop.value +`"` : ''))}></twx-widget-property>`
      }
      return propertiesStr;
    }

    builtChildren(includedWdgs) {
      let children = "";
      if(includedWdgs != "undefined") {
        includedWdgs.forEach(wdg=>{children += this.widgets[wdg.originalWidget](wdg)})
        return children;
      }
    }

    builtWidget(tagName, runtimeTemplate, initProps) {
      try {
        if(typeof initProps.children !== "undefined") {
          var gotOnlyParentProps = runtimeTemplate.substring(0,runtimeTemplate.indexOf('#children#')) // We don't want to let the parent get all properties from children so make a sub string to only get parents attributes
          runtimeTemplate = runtimeTemplate.replace("#children#", this.builtChildren(initProps.children));
        }
        // Introduce leaderlines for easier use a bit different as children in Panels and to be sure they are only as valid for 3DGauges and 3DImages this small changed if here
        if(typeof initProps.leaderlines !== "undefined" && (initProps.originalWidget === "twx-dt-sensor" || initProps.originalWidget === "twx-dt-image")) {
          var gotOnlyParentProps = runtimeTemplate.substring(0,runtimeTemplate.indexOf('#leaderlines#')) // We don't want to let the parent get all properties from children so make a sub string to only get parents attributes
          initProps.leaderlines.forEach(line => {
            line.originalWidget = "twx-dt-3dleaderline";
            line.originWidgetId = initProps.id;
            // See twxDtLeaderLine.design.js in delegate getKneeJointLengthForWidget for more info!
            if(typeof line.kneeJointLength !== "undefined")
              line.kneeJointLength = (initProps.width ? initProps.width : 0.1) * (initProps.scale ? initProps.scale : 1.0) / 2.0 * 1.5; 
          })
          runtimeTemplate = runtimeTemplate.replace("#leaderlines#", "<twx-container-content>" + this.builtChildren(initProps.leaderlines) +"</twx-container-content>");
        }
    
        let myWidget = '<twx-widget widget-id="' + initProps.id + '" original-widget="' + tagName + '" widget-name="' + initProps.id + '">' + this.builtEvents(initProps.events) + this.builtServices(initProps.services) + this.builtInitProperties(initProps.children ? gotOnlyParentProps : runtimeTemplate, initProps) + '<twx-widget-content>' + runtimeTemplate + '</twx-widget-content></twx-widget>';
        return myWidget;
      }
      catch(e) {
        console.log("XXX builtWidget " + e);
      }
    }

    injectWidget(widget, insertPos) {
      // This is a default config of studio not 100% sure why, but to be align with ootb
      widget = angular.element(twx.app.isPreview() ? widget.replace(/<twx-dt-modelitem /ig, '<twx-dt-modelitem ng-if="$root.thingViewReady !== false" ') : widget);

      angular.element(insertPos ? insertPos : document.querySelector("#tracker1 > twx-container-content")).append(widget);
      this.$compile(widget)(angular.element(document.querySelector("#tracker1")).scope());
      try{
        if(widget) {
          let models = widget.find("twx-dt-model")
          for(let i = 0; i < models.length; i++){
            let model = models[i];
            if(model.id.endsWith("-panel") && model.getAttribute("src") == '{"type":"box","height":1,"width":1,"depth":0.01}') {
              // This fix an error with panel widgets (buffer geometry) is not rendered correctly!
              setTimeout(()=>{
                //console.log(model.getAttribute("src"))
                //if(window.twx.app.isPreview())
                  this.renderer.setProperties(model.id, {shader: "ButtonEdge"});
                this.renderer.setTranslation(model.id,0,0,-0.01);
                this.renderer.setScale(model.id,model.getAttribute("sx"),model.getAttribute("sy"),1);
                this.scope.$applyAsync();
              },0);
            }
          }
          
          if(widget.attr("original-widget") === "twx-dt-target") {
            this.$compile(angular.element(document.querySelector("twx-dt-view")))(angular.element(document.querySelector("twx-dt-view")).scope());
            //this.setGuideImageData(angular.element(document.querySelector("twx-dt-target"))[0]);
          }
        }
      }catch(e){console.log(e)}
      /*if(widget) {
        let models = widget.find("twx-dt-model")
        for(let i = 0; i < models.length; i++){
          let model = models[i];
          console.log(model)
          if(model.id.endsWith("-panel")) {
            console.log(model.id)
            // try to recompile panels till they get init with shader me.shader which results in very bad behavoir!
            this.$compile(angular.element(model))(angular.element(document.querySelector("#tracker1")).scope());
          }
        }
      }*/
    //console.log("XXX: injectWidget #2")
    }

  }

  // Additional Class to load AngularJS Modules (This is used by the Extension Loader)
  // NOTE: you need the "Queen" hack to let this fully work in you experience you need to add 
  // following lines to the end of your home.js
  /**

  //  --- DO NOT DELETE!!! ---
  //  --- DO NOT DELETE!!! ---
  //  --- DO NOT DELETE!!! ---
  //This is a hack allow us to inject all necessary providers to our view!
  // jshint ignore:start
      }($scope, $element, $attrs, $timeout))
    })
    .config(($injector, $compileProvider, $controllerProvider, $filterProvider, $provide) => {
          twx.providers = {
              $injector,
              $compileProvider,
              $controllerProvider,
              $filterProvider,
              $provide
          };
      });

    (function(){
      (function(){
        return
  
  */ 
  class DynamicAngularModuleLoader {
      constructor() {
        this._initializedModules = {};
        // This function will subsequently mark all of the modules that the root application has already initialized
        // (this is the module that was bootstrapped). It also keeps a reference to the Angular module to dynamically
        // push new dependency modules to.
        this._markChildModulesInitialized("twxViewControllers");
        this._rootApplicationModule = angular.module("twxViewControllers");
        this.providers = twx.providers;
        //console.log(this._rootApplicationModule)
      }
      
      // This is the only function that is intended to be called by the application. It will push it to the root module's
      // list of required modules (the requires property on the module).
      // It will then initialize all of the pieces of the module by calling _initializeModule.
      // After that is done, it will execute the configuration and run blocks associated with all of the newly defined modules.  
      loadModule(moduleName) {
        this._rootApplicationModule.requires.push(moduleName);
        this._initializeModule(moduleName);
        this._executeRunsAndConfigs();     
      }
      
      _executeRunsAndConfigs() {
        const $injector = angular.element(document.querySelector('[ctrl-name="Home_TwxViewController"]')).injector();
        this._configBlocks.forEach(this._executeInvocation.bind(this));
        this._runBlocks.forEach($injector.invoke);
        delete this._configBlocks;
        delete this._runBlocks;
      }
      // This is where the bulk of the work is being done. It will iterate over the _invokeQueue, which is the list of services,
      // factories, etc that are associated with a module.
      // It will also push configuration and run blocks onto a collection to be executed post-initialization.
      // It then marks it as an already initialized module. If this step is skipped, singletons like services are overwritten,
      // configuration blocks are executed multiple times, all of which leads to problems down the line.
      // Lastly, it will iterate over the list of dependency modules and initialize those, too.
      _initializeModule(moduleName) {
        const module = angular.module(moduleName);
        module._invokeQueue.reverse().forEach(this._executeInvocation.bind(this));
        this._configBlocks = this._configBlocks ? this._configBlocks.concat(module._configBlocks) : module._configBlocks;
        this._runBlocks = this._runBlocks ? this._runBlocks.concat(module._runBlocks) : module._runBlocks;
        this._initializedModules[moduleName] = true;
        console.log(moduleName+' initialized')
        module.requires.forEach((nestedModule) => {
          if (!this._initializedModules[nestedModule]) {
            this._initializeModule(nestedModule);
          }
        });
      }
      // This function simply put, takes an entry from the _invokeQueue and initializes it by calling a specific provider's
      // method against a specific construct (like a service). These are specified in an array such as:
      // ['$compileProvider', 'component', ['componentName' ...]].
      _executeInvocation([providerName, providerMethod, construct]) {
        //console.log(this.providers[providerName])
        const provider = this.providers[providerName];
        provider[providerMethod].apply(provider, construct);
      }
      _markChildModulesInitialized(module) {
        if (!this._initializedModules[module]) {
          this._initializedModules[module] = true;
          const angularModule = angular.module(module);
          angularModule.requires.forEach((key) => {
            this._markChildModulesInitialized(key);
          });
        }
      }
    }
    return new VuLoader();
}));