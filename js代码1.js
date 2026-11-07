(function(Scratch){
  'use strict';
  if(!Scratch.extensions.unsandboxed) throw new Error('needs unsandboxed');
  class MyVideo { getInfo(){ return {id:'myvideo', name:'My Video', blocks:[/*...*/]}; } }
  Scratch.extensions.register(new MyVideo());
})(Scratch);