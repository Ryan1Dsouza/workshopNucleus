try{await import('./game.js');if(window.__openwii)parent.postMessage({type:'fruit-ready'},location.origin);}
catch(error){parent.postMessage({type:'fruit-error',message:error.message},location.origin);throw error;}
